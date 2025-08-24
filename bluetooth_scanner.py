#!/usr/bin/env python3
"""
Bluetooth Scanner for iConsole Exercise Bike
Scans for BLE devices and identifies potential iConsole devices
"""

import asyncio
import logging
from bleak import BleakScanner, BleakClient
from typing import List, Dict, Optional

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BluetoothScanner:
    def __init__(self):
        self.devices = []
        
    async def scan_devices(self, duration: int = 10) -> List[Dict]:
        """Scan for BLE devices for specified duration"""
        print(f"🔍 Scanning for Bluetooth devices for {duration} seconds...")
        print("Make sure your exercise bike is powered on and in pairing mode!\n")
        
        devices = await BleakScanner.discover(timeout=duration)
        
        self.devices = []
        for device in devices:
            device_info = {
                'address': device.address,
                'name': device.name or "Unknown",
                'rssi': device.rssi,
                'metadata': device.metadata
            }
            self.devices.append(device_info)
            
        return self.devices
    
    def display_devices(self):
        """Display found devices in a readable format"""
        if not self.devices:
            print("❌ No devices found!")
            return
            
        print(f"📱 Found {len(self.devices)} devices:")
        print("-" * 80)
        
        for i, device in enumerate(self.devices):
            name = device['name']
            address = device['address']
            rssi = device['rssi']
            
            # Highlight potential iConsole devices
            is_potential = self._is_potential_iconsole(device)
            marker = "🎯" if is_potential else "📱"
            
            print(f"{marker} [{i+1}] {name}")
            print(f"    Address: {address}")
            print(f"    Signal: {rssi} dBm")
            if is_potential:
                print("    ⭐ POTENTIAL iConsole DEVICE!")
            print()
    
    def _is_potential_iconsole(self, device: Dict) -> bool:
        """Check if device might be an iConsole device"""
        name = device['name'].lower()
        
        # Common iConsole device name patterns
        iconsole_patterns = [
            'iconsole', 'i-console', 'console', 'bike', 'cycle', 
            'fitness', 'exercise', 'cardio', 'gym', 'workout'
        ]
        
        return any(pattern in name for pattern in iconsole_patterns)
    
    async def inspect_device(self, device_address: str):
        """Inspect a specific device's services and characteristics"""
        print(f"🔍 Inspecting device: {device_address}")
        
        try:
            async with BleakClient(device_address) as client:
                if not client.is_connected:
                    print("❌ Failed to connect to device")
                    return
                    
                print("✅ Connected successfully!")
                print("\n📋 Services and Characteristics:")
                print("-" * 60)
                
                services = client.services
                for service in services:
                    print(f"\n🔧 Service: {service.uuid}")
                    print(f"   Description: {self._get_service_description(service.uuid)}")
                    
                    for char in service.characteristics:
                        properties = ', '.join(char.properties)
                        print(f"   📊 Characteristic: {char.uuid}")
                        print(f"      Properties: {properties}")
                        print(f"      Description: {self._get_characteristic_description(char.uuid)}")
                        
        except Exception as e:
            print(f"❌ Error inspecting device: {e}")
    
    def _get_service_description(self, uuid: str) -> str:
        """Get human-readable service description"""
        services = {
            "0000180f-0000-1000-8000-00805f9b34fb": "Battery Service",
            "0000180a-0000-1000-8000-00805f9b34fb": "Device Information Service",
            "00001826-0000-1000-8000-00805f9b34fb": "Fitness Machine Service",
            "00001816-0000-1000-8000-00805f9b34fb": "Cycling Speed and Cadence",
            "00001818-0000-1000-8000-00805f9b34fb": "Cycling Power Service",
            "0000180d-0000-1000-8000-00805f9b34fb": "Heart Rate Service"
        }
        return services.get(uuid.lower(), "Unknown Service")
    
    def _get_characteristic_description(self, uuid: str) -> str:
        """Get human-readable characteristic description"""
        characteristics = {
            "00002a5b-0000-1000-8000-00805f9b34fb": "CSC Measurement (Speed/Cadence)",
            "00002a5c-0000-1000-8000-00805f9b34fb": "CSC Feature",
            "00002a63-0000-1000-8000-00805f9b34fb": "Cycling Power Measurement",
            "00002acc-0000-1000-8000-00805f9b34fb": "Fitness Machine Feature",
            "00002ad2-0000-1000-8000-00805f9b34fb": "Indoor Bike Data",
            "00002ad9-0000-1000-8000-00805f9b34fb": "Fitness Machine Control Point",
            "00002a37-0000-1000-8000-00805f9b34fb": "Heart Rate Measurement",
            "00002a19-0000-1000-8000-00805f9b34fb": "Battery Level"
        }
        return characteristics.get(uuid.lower(), "Unknown Characteristic")

async def main():
    scanner = BluetoothScanner()
    
    print("🚴 iConsole Exercise Bike Bluetooth Scanner")
    print("=" * 50)
    
    # Scan for devices
    await scanner.scan_devices(duration=15)
    scanner.display_devices()
    
    if not scanner.devices:
        print("\n💡 Tips:")
        print("- Make sure your exercise bike is powered on")
        print("- Put the bike in pairing/discoverable mode")
        print("- Move closer to the bike")
        print("- Try running the scan again")
        return
    
    # Let user select a device to inspect
    print("\n🔍 Want to inspect a device? Enter the number (or 'q' to quit):")
    try:
        choice = input("Choice: ").strip()
        if choice.lower() == 'q':
            return
            
        device_num = int(choice) - 1
        if 0 <= device_num < len(scanner.devices):
            device = scanner.devices[device_num]
            await scanner.inspect_device(device['address'])
        else:
            print("❌ Invalid device number")
            
    except (ValueError, KeyboardInterrupt):
        print("\n👋 Goodbye!")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Scan interrupted by user")

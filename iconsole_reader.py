#!/usr/bin/env python3
"""
iConsole Data Reader
Connects to iConsole exercise bike and reads real-time data
"""

import asyncio
import logging
import struct
import time
from datetime import datetime
from bleak import BleakClient
from typing import Optional, Dict, Any

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class iConsoleDataReader:
    def __init__(self, device_address: str, wheel_circumference_m: float = 1.0525):
        self.device_address = device_address
        self.client: Optional[BleakClient] = None
        self.is_connected = False
        self.data_log = []
        
        # Exercise bike wheel simulation parameters
        # Adjusted: ~13" wheel equivalent = 1.0525m circumference (half of 26")
        # This gives more realistic exercise bike speeds
        # Common exercise bike wheel circumferences:
        # - Small wheel: 1.0525m circumference (default - realistic speeds)
        # - 20" wheel: 1.57m circumference
        # - 24" wheel: 1.88m circumference  
        # - 26" wheel: 2.105m circumference (too fast for exercise bikes)
        self.wheel_circumference_m = wheel_circumference_m
        
        # Tracking for speed/distance calculations
        self.last_wheel_revs = None
        self.last_wheel_time = None
        self.total_distance_m = 0.0
        self.last_crank_revs = None
        self.last_crank_time = None
        
        # Common fitness machine UUIDs
        self.FITNESS_MACHINE_SERVICE = "00001826-0000-1000-8000-00805f9b34fb"
        self.INDOOR_BIKE_DATA = "00002ad2-0000-1000-8000-00805f9b34fb"
        self.CSC_SERVICE = "00001816-0000-1000-8000-00805f9b34fb"
        self.CSC_MEASUREMENT = "00002a5b-0000-1000-8000-00805f9b34fb"
        self.CYCLING_POWER_SERVICE = "00001818-0000-1000-8000-00805f9b34fb"
        self.CYCLING_POWER_MEASUREMENT = "00002a63-0000-1000-8000-00805f9b34fb"
        
    async def connect(self) -> bool:
        """Connect to the iConsole device"""
        try:
            print(f"🔗 Connecting to {self.device_address}...")
            self.client = BleakClient(self.device_address)
            await self.client.connect()
            
            if self.client.is_connected:
                self.is_connected = True
                print("✅ Connected successfully!")
                return True
            else:
                print("❌ Failed to connect")
                return False
                
        except Exception as e:
            print(f"❌ Connection error: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from the device"""
        if self.client and self.is_connected:
            await self.client.disconnect()
            self.is_connected = False
            print("🔌 Disconnected")
    
    async def start_data_stream(self):
        """Start reading data from the exercise bike"""
        if not self.is_connected:
            print("❌ Not connected to device")
            return
            
        print("🚴 Starting data stream...")
        print("📊 Real-time Exercise Data:")
        print("=" * 60)
        
        # Try to subscribe to different characteristics
        await self._try_subscribe_to_characteristics()
        
        # Keep the connection alive and display data
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            print("\n⏹️  Stopping data stream...")
    
    async def _try_subscribe_to_characteristics(self):
        """Try to subscribe to various fitness-related characteristics"""
        characteristics_to_try = [
            (self.INDOOR_BIKE_DATA, "Indoor Bike Data"),
            (self.CSC_MEASUREMENT, "Cycling Speed & Cadence"),
            (self.CYCLING_POWER_MEASUREMENT, "Cycling Power"),
        ]
        
        subscribed_count = 0
        
        for char_uuid, char_name in characteristics_to_try:
            try:
                await self.client.start_notify(char_uuid, self._create_notification_handler(char_name))
                print(f"✅ Subscribed to {char_name}")
                subscribed_count += 1
            except Exception as e:
                logger.debug(f"Could not subscribe to {char_name}: {e}")
        
        if subscribed_count == 0:
            print("⚠️  No standard characteristics found. Trying to discover custom ones...")
            await self._discover_and_subscribe_custom()
    
    async def _discover_and_subscribe_custom(self):
        """Discover and subscribe to custom characteristics that might contain data"""
        services = self.client.services
        subscribed_count = 0
        
        for service in services:
            for char in service.characteristics:
                # Look for characteristics that support notifications
                if "notify" in char.properties or "indicate" in char.properties:
                    try:
                        await self.client.start_notify(
                            char.uuid, 
                            self._create_notification_handler(f"Custom-{char.uuid[:8]}")
                        )
                        print(f"✅ Subscribed to custom characteristic: {char.uuid}")
                        subscribed_count += 1
                    except Exception as e:
                        logger.debug(f"Could not subscribe to {char.uuid}: {e}")
        
        if subscribed_count == 0:
            print("❌ No notifiable characteristics found!")
            print("💡 The device might use a different communication method.")
    
    def _create_notification_handler(self, char_name: str):
        """Create a notification handler for a specific characteristic"""
        def notification_handler(sender, data: bytearray):
            timestamp = datetime.now().strftime("%H:%M:%S")
            
            # Log raw data
            raw_hex = data.hex()
            print(f"\n📡 [{timestamp}] {char_name}")
            print(f"   Raw data: {raw_hex}")
            print(f"   Length: {len(data)} bytes")
            
            # Try to decode the data
            decoded_data = self._decode_data(data, char_name)
            if decoded_data:
                self._display_decoded_data(decoded_data)
            
            # Store for analysis
            self.data_log.append({
                'timestamp': timestamp,
                'characteristic': char_name,
                'raw_data': raw_hex,
                'decoded_data': decoded_data
            })
            
        return notification_handler
    
    def _decode_data(self, data: bytearray, char_name: str) -> Optional[Dict[str, Any]]:
        """Attempt to decode the raw data based on characteristic type"""
        try:
            if "Indoor Bike Data" in char_name:
                return self._decode_indoor_bike_data(data)
            elif "Cycling Speed" in char_name:
                return self._decode_csc_data(data)
            elif "Cycling Power" in char_name:
                return self._decode_power_data(data)
            else:
                return self._decode_generic_data(data)
        except Exception as e:
            logger.debug(f"Error decoding {char_name}: {e}")
            return None
    
    def _decode_indoor_bike_data(self, data: bytearray) -> Dict[str, Any]:
        """Decode Indoor Bike Data characteristic (FTMS)"""
        if len(data) < 2:
            return {}
            
        # First 2 bytes are flags
        flags = struct.unpack('<H', data[:2])[0]
        decoded = {'flags': flags}
        offset = 2
        
        # Parse based on flags (simplified version)
        if flags & 0x01 and offset + 2 <= len(data):  # Speed present
            speed = struct.unpack('<H', data[offset:offset+2])[0] / 100  # km/h
            decoded['speed_kmh'] = speed
            offset += 2
            
        if flags & 0x02 and offset + 2 <= len(data):  # Cadence present
            cadence = struct.unpack('<H', data[offset:offset+2])[0] / 2  # RPM
            decoded['cadence_rpm'] = cadence
            offset += 2
            
        if flags & 0x04 and offset + 2 <= len(data):  # Distance present
            distance = struct.unpack('<H', data[offset:offset+2])[0]  # meters
            decoded['distance_m'] = distance
            offset += 2
            
        if flags & 0x08 and offset + 2 <= len(data):  # Power present
            power = struct.unpack('<h', data[offset:offset+2])[0]  # watts
            decoded['power_watts'] = power
            offset += 2
            
        return decoded
    
    def _decode_csc_data(self, data: bytearray) -> Dict[str, Any]:
        """Decode Cycling Speed and Cadence data with speed/distance calculations"""
        if len(data) < 1:
            return {}
            
        flags = data[0]
        decoded = {'flags': flags}
        offset = 1
        
        if flags & 0x01 and offset + 6 <= len(data):  # Wheel revolution data
            wheel_revs = struct.unpack('<L', data[offset:offset+4])[0]
            wheel_time = struct.unpack('<H', data[offset+4:offset+6])[0]
            decoded['wheel_revolutions'] = wheel_revs
            decoded['wheel_event_time'] = wheel_time
            
            # Calculate speed and distance from wheel data
            speed_kmh, distance_km = self._calculate_wheel_metrics(wheel_revs, wheel_time)
            if speed_kmh is not None:
                decoded['calculated_speed_kmh'] = speed_kmh
            if distance_km is not None:
                decoded['total_distance_km'] = distance_km
                
            offset += 6
            
        if flags & 0x02 and offset + 4 <= len(data):  # Crank revolution data
            crank_revs = struct.unpack('<H', data[offset:offset+2])[0]
            crank_time = struct.unpack('<H', data[offset+2:offset+4])[0]
            decoded['crank_revolutions'] = crank_revs
            decoded['crank_event_time'] = crank_time
            
            # Calculate cadence from crank data
            cadence_rpm = self._calculate_cadence(crank_revs, crank_time)
            if cadence_rpm is not None:
                decoded['calculated_cadence_rpm'] = cadence_rpm
            
        return decoded
    
    def _decode_power_data(self, data: bytearray) -> Dict[str, Any]:
        """Decode Cycling Power data"""
        if len(data) < 4:
            return {}
            
        flags = struct.unpack('<H', data[:2])[0]
        power = struct.unpack('<h', data[2:4])[0]
        
        return {
            'flags': flags,
            'instantaneous_power_watts': power
        }
    
    def _calculate_wheel_metrics(self, wheel_revs: int, wheel_time: int) -> tuple[Optional[float], Optional[float]]:
        """Calculate speed (km/h) and total distance (km) from wheel revolution data"""
        # Update total distance
        if self.last_wheel_revs is not None:
            rev_diff = wheel_revs - self.last_wheel_revs
            if rev_diff > 0:  # Handle rollover and ensure positive
                distance_increment = rev_diff * self.wheel_circumference_m
                self.total_distance_m += distance_increment
        
        # Calculate speed
        speed_kmh = None
        if self.last_wheel_revs is not None and self.last_wheel_time is not None:
            rev_diff = wheel_revs - self.last_wheel_revs
            time_diff = wheel_time - self.last_wheel_time
            
            # Handle time rollover (16-bit counter, rolls over at 65536)
            if time_diff < 0:
                time_diff += 65536
                
            if time_diff > 0 and rev_diff > 0:
                # Time is in 1/1024 seconds
                time_seconds = time_diff / 1024.0
                distance_meters = rev_diff * self.wheel_circumference_m
                speed_ms = distance_meters / time_seconds
                speed_kmh = speed_ms * 3.6  # Convert m/s to km/h
        
        # Store current values for next calculation
        self.last_wheel_revs = wheel_revs
        self.last_wheel_time = wheel_time
        
        return speed_kmh, self.total_distance_m / 1000.0  # Convert to km
    
    def _calculate_cadence(self, crank_revs: int, crank_time: int) -> Optional[float]:
        """Calculate cadence (RPM) from crank revolution data"""
        cadence_rpm = None
        
        if self.last_crank_revs is not None and self.last_crank_time is not None:
            rev_diff = crank_revs - self.last_crank_revs
            time_diff = crank_time - self.last_crank_time
            
            # Handle time rollover (16-bit counter)
            if time_diff < 0:
                time_diff += 65536
                
            if time_diff > 0 and rev_diff > 0:
                # Time is in 1/1024 seconds
                time_seconds = time_diff / 1024.0
                time_minutes = time_seconds / 60.0
                cadence_rpm = rev_diff / time_minutes
        
        # Store current values for next calculation
        self.last_crank_revs = crank_revs
        self.last_crank_time = crank_time
        
        return cadence_rpm
    
    def _decode_generic_data(self, data: bytearray) -> Dict[str, Any]:
        """Generic data decoding - try common patterns"""
        decoded = {}
        
        # Try to find patterns in the data
        if len(data) >= 2:
            # Try as 16-bit integers
            for i in range(0, len(data) - 1, 2):
                try:
                    val = struct.unpack('<H', data[i:i+2])[0]
                    decoded[f'uint16_{i//2}'] = val
                except:
                    pass
        
        # Try as individual bytes
        for i, byte in enumerate(data):
            decoded[f'byte_{i}'] = byte
            
        return decoded
    
    def _display_decoded_data(self, data: Dict[str, Any]):
        """Display decoded data in a readable format"""
        print("   📈 Decoded values:")
        
        # Show calculated metrics first (most important)
        if 'calculated_speed_kmh' in data:
            print(f"      🚴 Speed: {data['calculated_speed_kmh']:.1f} km/h")
        if 'total_distance_km' in data:
            print(f"      📏 Distance: {data['total_distance_km']:.3f} km")
        if 'calculated_cadence_rpm' in data:
            print(f"      🔄 Cadence: {data['calculated_cadence_rpm']:.1f} RPM")
            
        # Show other metrics
        for key, value in data.items():
            if key.startswith('calculated_') or key.startswith('total_'):
                continue  # Already shown above
            elif 'speed' in key.lower() and 'calculated' not in key:
                print(f"      🏃 Raw Speed: {value} km/h")
            elif 'cadence' in key.lower() and 'calculated' not in key:
                print(f"      🔄 Raw Cadence: {value} RPM")
            elif 'power' in key.lower():
                print(f"      ⚡ Power: {value} watts")
            elif 'distance' in key.lower() and 'total' not in key:
                print(f"      📏 Raw Distance: {value} m")
            elif 'heart' in key.lower():
                print(f"      ❤️  Heart Rate: {value} BPM")
            elif key in ['wheel_revolutions', 'crank_revolutions']:
                print(f"      🔢 {key.replace('_', ' ').title()}: {value}")
            elif not key.startswith('flags') and not key.endswith('_time'):
                print(f"      📊 {key}: {value}")

async def main():
    print("🚴 iConsole Data Reader")
    print("=" * 30)
    
    # Get device address from user
    device_address = input("Enter the Bluetooth address of your iConsole device: ").strip()
    
    if not device_address:
        print("❌ No device address provided")
        return
    
    # Create reader and connect
    reader = iConsoleDataReader(device_address)
    
    try:
        if await reader.connect():
            await reader.start_data_stream()
    except KeyboardInterrupt:
        print("\n⏹️  Stopping...")
    finally:
        await reader.disconnect()
        
        # Show summary
        if reader.data_log:
            print(f"\n📋 Captured {len(reader.data_log)} data packets")
            print("💾 Data logged for analysis")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")

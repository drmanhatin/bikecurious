#!/usr/bin/env python3
"""
iConsole Background Service
Connects to iConsole exercise bike and updates menu bar
"""

import asyncio
import logging
import struct
import time
import json
import threading
from datetime import datetime
from bleak import BleakClient, BleakScanner
from typing import Optional, Dict, Any, List
from pathlib import Path
from menubar_app import main as menubar_main

# Set up logging
log_dir = Path.home() / "Library" / "Logs" / "iConsole"
log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_dir / "iconsole_service.log"),
        logging.StreamHandler()  # Also log to console
    ]
)
logger = logging.getLogger(__name__)

class iConsoleDataReader:
    def __init__(self):
        self.device_address = None
        self.client: Optional[BleakClient] = None
        self.is_connected = False
        self.menubar_app = None
        
        # Distance tracking
        self.data_dir = Path.home() / "Documents" / "iConsole_Data"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.distance_file = self.data_dir / "total_distance.json"
        self.total_distance_km = self._load_total_distance()
        
        # Speed tracking
        self.speed_datapoints: List[float] = []  # Speed readings from last 3 seconds
        self.datapoints_lock = threading.Lock()
        self.current_speed = 0.0
        self.last_data_time = time.time()
        
        # Wheel tracking for speed calculation
        self.last_wheel_revs = None
        self.last_wheel_time = None
        
        # Update thread
        self.update_thread = None
        self.stop_updates = False
        

    
    def _load_total_distance(self) -> float:
        """Load total distance from file"""
        try:
            if self.distance_file.exists():
                with open(self.distance_file, 'r') as f:
                    data = json.load(f)
                    return data.get('total_km', 0.0)
        except Exception as e:
            logger.warning(f"Could not load distance: {e}")
        return 0.0
    
    def _save_total_distance(self):
        """Save total distance to file"""
        try:
            with open(self.distance_file, 'w') as f:
                json.dump({'total_km': self.total_distance_km, 'last_updated': datetime.now().isoformat()}, f)
        except Exception as e:
            logger.error(f"Could not save distance: {e}")
    
    def _add_speed_datapoint(self, speed: float):
        """Add a speed datapoint"""
        # Discard unrealistic speed readings over 50 km/h
        if speed > 50.0:
            logger.warning(f"Discarding unrealistic speed reading: {speed:.1f} km/h (over 50 km/h limit)")
            return
        
        current_time = time.time()
        with self.datapoints_lock:
            self.speed_datapoints.append(speed)
            self.last_data_time = current_time
            logger.info(f"Speed: {speed:.1f} km/h")
    
    def _update_worker(self):
        """Background thread that updates menu bar every second"""
        logger.info("Update worker started")
        
        while not self.stop_updates:
            current_time = time.time()
            
            with self.datapoints_lock:
                # Remove datapoints older than 3 seconds
                cutoff_time = current_time - 3.0
                recent_datapoints = [dp for dp in self.speed_datapoints if True]  # Keep all for now, filter by time
                
                if recent_datapoints:
                    # Average speed from recent datapoints
                    old_speed = self.current_speed
                    self.current_speed = sum(recent_datapoints) / len(recent_datapoints)
                    self.speed_datapoints.clear()  # Clear after averaging
                    logger.info(f"Speed updated: {old_speed:.1f} -> {self.current_speed:.1f} km/h from {len(recent_datapoints)} datapoints")
                else:
                    # No recent data - decay speed by 33% per second
                    time_since_data = current_time - self.last_data_time
                    if time_since_data > 1.0:
                        old_speed = self.current_speed
                        decay_factor = 0.67 ** int(time_since_data)
                        self.current_speed *= decay_factor
                        if self.current_speed < 0.1:
                            self.current_speed = 0.0
                        if old_speed != self.current_speed:
                            pass
            
            # Add distance based on current speed (distance = speed * time)
            if self.current_speed > 0:
                distance_increment = (self.current_speed / 3600.0)  # km per second
                self.total_distance_km += distance_increment
                self._save_total_distance()
            
            # Update menu bar
            if self.menubar_app:
                self.menubar_app.update_display(self.current_speed, self.total_distance_km)
            else:
                logger.warning("Menu bar app not available")
            
            time.sleep(1.0)  # Update every second
        
        logger.info("Update worker stopped")
    
    def start_update_thread(self):
        """Start the update thread"""
        self.stop_updates = False
        self.update_thread = threading.Thread(target=self._update_worker, daemon=True)
        self.update_thread.start()
    
    def stop_update_thread(self):
        """Stop the update thread"""
        self.stop_updates = True
        if self.update_thread:
            self.update_thread.join()
    
    async def find_iconsole_device(self) -> bool:
        """Find and set iConsole device"""
        logger.info("Scanning for iConsole devices...")
        
        while True:
            try:
                scanner = BleakScanner()
                devices = await scanner.discover(timeout=10.0)
                
                for device in devices:
                    if device.name and "iconsole" in device.name.lower():
                        self.device_address = device.address
                        logger.info(f"Found iConsole device: {device.name} ({device.address})")
                        return True
                
                logger.warning("No iConsole devices found, retrying in 5 seconds...")
                await asyncio.sleep(5.0)
                
            except Exception as e:
                logger.error(f"Error scanning for devices: {e}")
                await asyncio.sleep(5.0)
    
    async def connect(self) -> bool:
        """Connect to the device"""
        if not self.device_address:
            if not await self.find_iconsole_device():
                return False
        
        try:
            logger.info(f"Connecting to {self.device_address}...")
            self.client = BleakClient(self.device_address)
            await self.client.connect()
            
            if self.client.is_connected:
                self.is_connected = True
                logger.info("Connected successfully!")
                return True
            else:
                logger.error("Failed to connect")
                return False
        except Exception as e:
            logger.error(f"Connection error: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from device"""
        self.stop_update_thread()
        if self.client and self.is_connected:
            await self.client.disconnect()
            self.is_connected = False
            logger.info("Disconnected")
    
    async def start_data_stream(self):
        """Start reading data from the bike"""
        if not self.is_connected:
            logger.error("Not connected")
            return
        
        logger.info("Starting data stream...")
        logger.info(f"Total distance: {self.total_distance_km:.3f} km")
        
        # Start update thread
        self.start_update_thread()
        
        # Subscribe to characteristics
        await self._subscribe_to_characteristics()
        
        # Keep connection alive
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            logger.info("Stopping...")
    
    async def _subscribe_to_characteristics(self):
        """Subscribe to bike data characteristics"""
        logger.info("Discovering and subscribing to available characteristics...")
        
        subscribed_count = 0
        services = self.client.services
        
        for service in services:
            logger.info(f"Service: {service.uuid}")
            for char in service.characteristics:
                logger.info(f"  Characteristic: {char.uuid} - Properties: {char.properties}")
                
                # Try to subscribe to any characteristic that supports notifications
                if "notify" in char.properties or "indicate" in char.properties:
                    try:
                        await self.client.start_notify(char.uuid, self._create_handler(f"Service-{service.uuid[:8]}-{char.uuid[:8]}"))
                        logger.info(f"  -> Successfully subscribed to {char.uuid}")
                        subscribed_count += 1
                    except Exception as e:
                        logger.warning(f"  -> Could not subscribe to {char.uuid}: {e}")
        
        if subscribed_count == 0:
            logger.error("No characteristics could be subscribed to!")
        else:
            logger.info(f"Successfully subscribed to {subscribed_count} characteristics")
    
    def _create_handler(self, name: str):
        """Create notification handler"""
        def handler(sender, data: bytearray):
            logger.debug(f"Received data from {name}: {data.hex()} ({len(data)} bytes)")
            speed = self._extract_speed(data, name)
            if speed is not None:
                self._add_speed_datapoint(speed)
            else:
                logger.debug(f"No speed extracted from {name} data")
        return handler
    
    def _extract_speed(self, data: bytearray, char_name: str) -> Optional[float]:
        """Extract speed from BLE data"""
        try:
            # Try different data formats based on characteristic name
            if "2ad2" in char_name and len(data) >= 4:  # Indoor Bike Data
                flags = struct.unpack('<H', data[:2])[0]
                if flags & 0x01:  # Speed present
                    speed = struct.unpack('<H', data[2:4])[0] / 100.0  # km/h
                    return speed
            
            elif "2a5b" in char_name and len(data) >= 7:  # Speed & Cadence
                flags = data[0]
                if flags & 0x01:  # Wheel data present
                    # Extract wheel revolution data
                    wheel_revs = struct.unpack('<L', data[1:5])[0]
                    wheel_time = struct.unpack('<H', data[5:7])[0]
                    
                    # Calculate speed from wheel data
                    if self.last_wheel_revs is not None and self.last_wheel_time is not None:
                        rev_diff = wheel_revs - self.last_wheel_revs
                        time_diff = wheel_time - self.last_wheel_time
                        
                        # Handle time rollover (16-bit counter)
                        if time_diff < 0:
                            time_diff += 65536
                        
                        if time_diff > 0 and rev_diff > 0:
                            # Time is in 1/1024 seconds
                            time_seconds = time_diff / 1024.0
                            distance_meters = rev_diff * 1.0525  # wheel circumference
                            speed_ms = distance_meters / time_seconds
                            speed_kmh = speed_ms * 3.6  # Convert m/s to km/h
                            
                            # Store for next calculation
                            self.last_wheel_revs = wheel_revs
                            self.last_wheel_time = wheel_time
                            
                            return speed_kmh
                    
                    # Store current values for next calculation
                    self.last_wheel_revs = wheel_revs
                    self.last_wheel_time = wheel_time
            
            # Generic speed extraction for unknown characteristics
            elif len(data) >= 2:
                # Try to interpret as simple speed value
                try:
                    speed = struct.unpack('<H', data[:2])[0] / 100.0
                    if 0 <= speed <= 100:  # Reasonable speed range
                        return speed
                except:
                    pass
            
        except Exception as e:
            logger.debug(f"Error extracting speed from {char_name}: {e}")
        
        return None
    


def main():
    """Main function"""
    logger.info("iConsole Service Starting")
    
    # Create a simple shared object to pass the menubar app
    shared = {'menubar_app': None, 'reader': None}
    
    def start_bluetooth():
        """Start bluetooth in background thread"""
        async def bluetooth_worker():
            # Wait for menubar to be ready
            while shared['menubar_app'] is None:
                await asyncio.sleep(0.1)
            
            # Create reader (will scan for iConsole devices automatically)
            reader = iConsoleDataReader()
            reader.menubar_app = shared['menubar_app']
            shared['reader'] = reader
            
            try:
                if await reader.connect():
                    await reader.start_data_stream()
                else:
                    logger.error("Failed to connect to iConsole device")
            except KeyboardInterrupt:
                logger.info("Service stopped")
            finally:
                await reader.disconnect()
        
        asyncio.run(bluetooth_worker())
    
    # Start bluetooth in background thread
    bluetooth_thread = threading.Thread(target=start_bluetooth, daemon=True)
    bluetooth_thread.start()
    
    # Start menu bar on main thread (required for macOS)
    def update_function(speed, distance):
        pass
    
    # Create and run the menubar app (blocks on main thread)
    menubar_app = menubar_main(update_function)
    shared['menubar_app'] = menubar_app
    menubar_app.run()

if __name__ == "__main__":
    main()
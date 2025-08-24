#!/usr/bin/env python3
"""
Helth Daemon - Combined iConsole Service and Menu Bar App
Runs both the iConsole Bluetooth connection and menu bar display as a single daemon
"""

import asyncio
import logging
import threading
import time
import json
from datetime import datetime
from pathlib import Path
from iconsole_reader import iConsoleDataReader
from menubar_app import iConsoleMenuBarApp
import rumps

# Set up logging for daemon
log_dir = Path.home() / "Library" / "Logs" / "Helth"
log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_dir / "helth_daemon.log"),
        logging.StreamHandler()  # Keep console output for debugging
    ]
)
logger = logging.getLogger(__name__)

class FixedConsoleDataReader(iConsoleDataReader):
    """Enhanced iConsole reader with proper distance persistence and 5-second speed averaging"""
    
    def __init__(self, device_address: str, wheel_circumference_m: float = 1.0525):
        super().__init__(device_address, wheel_circumference_m)
        
        # Initialize total_distance_m from saved data
        self.total_distance_m = self.total_km * 1000.0  # Convert km to meters
        logger.info(f"Initialized with saved distance: {self.total_km:.3f} km")
        
        # Fresh approach: Kalman-like filtering with adaptive smoothing
        self.speed_buffer = []  # Circular buffer for speed readings
        self.buffer_size = 10   # Keep last 10 readings
        self.last_smoothed_speed = 0.0
        self.last_update_time = time.time()
        self.update_interval = 1.0  # Update every 1 second
        
        # Adaptive smoothing parameters
        self.min_speed_threshold = 1.0  # Below this = 0
        self.max_acceleration = 2.0     # Maximum km/h per second acceleration
        self.max_deceleration = 3.0     # Maximum km/h per second deceleration (more permissive)
        self.smoothing_factor = 0.15    # Very conservative smoothing (15% new data)
        
        # Outlier detection
        self.speed_std_threshold = 3.0  # Standard deviation threshold for outliers
    
    def _calculate_wheel_metrics(self, wheel_revs: int, wheel_time: int):
        """Enhanced wheel metrics calculation with proper distance persistence"""
        # Update total distance
        if self.last_wheel_revs is not None:
            rev_diff = wheel_revs - self.last_wheel_revs
            if rev_diff > 0:  # Handle rollover and ensure positive
                distance_increment = rev_diff * self.wheel_circumference_m
                self.total_distance_m += distance_increment
                
                # Update total_km and save immediately
                new_total_km = self.total_distance_m / 1000.0
                if new_total_km > self.total_km:
                    self.total_km = new_total_km
                    self._save_total_distance()
                    logger.debug(f"Distance updated: {self.total_km:.3f} km (+{distance_increment:.2f}m)")
        
        # Calculate instantaneous speed
        current_speed = None
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
                current_speed = speed_ms * 3.6  # Convert m/s to km/h
        
        # Fresh approach: Multi-stage filtering with outlier rejection
        current_time = time.time()
        
        # Only update speed if enough time has passed (1-second interval)
        if current_time - self.last_update_time >= self.update_interval:
            if current_speed is not None:
                # Stage 1: Add to circular buffer
                self.speed_buffer.append(current_speed)
                if len(self.speed_buffer) > self.buffer_size:
                    self.speed_buffer.pop(0)  # Remove oldest reading
            
            # Stage 2: Outlier detection and removal
            if len(self.speed_buffer) >= 3:
                import statistics
                mean_speed = statistics.mean(self.speed_buffer)
                std_speed = statistics.stdev(self.speed_buffer) if len(self.speed_buffer) > 1 else 0
                
                # Remove outliers (readings more than 3 std devs from mean)
                filtered_buffer = []
                for speed in self.speed_buffer:
                    if abs(speed - mean_speed) <= self.speed_std_threshold * std_speed:
                        filtered_buffer.append(speed)
                
                if filtered_buffer:
                    # Stage 3: Calculate median (more robust than mean)
                    median_speed = statistics.median(filtered_buffer)
                else:
                    median_speed = mean_speed
            else:
                median_speed = current_speed if current_speed is not None else 0.0
            
            # Stage 4: Rate limiting (acceleration/deceleration limits)
            if median_speed is not None:
                time_diff = current_time - self.last_update_time
                max_change = self.max_acceleration * time_diff  # km/h per second
                
                speed_diff = median_speed - self.last_smoothed_speed
                
                if abs(speed_diff) > max_change:
                    # Limit the change based on direction
                    if speed_diff > 0:  # Accelerating
                        limited_speed = self.last_smoothed_speed + max_change
                    else:  # Decelerating (use more permissive limit)
                        limited_speed = self.last_smoothed_speed - (self.max_deceleration * time_diff)
                    
                    logger.debug(f"Speed change limited: {speed_diff:.1f} km/h -> {limited_speed - self.last_smoothed_speed:.1f} km/h")
                    median_speed = limited_speed
                
                # Stage 5: Very conservative exponential smoothing
                smoothed_speed = (self.smoothing_factor * median_speed) + ((1 - self.smoothing_factor) * self.last_smoothed_speed)
                
                # Stage 6: Threshold rounding
                speed_kmh = smoothed_speed if smoothed_speed >= self.min_speed_threshold else 0.0
                
                # Update for next iteration
                self.last_smoothed_speed = smoothed_speed
            else:
                speed_kmh = 0.0
                self.last_smoothed_speed = 0.0
            
            # Update last update time
            self.last_update_time = current_time
        else:
            # Return last calculated speed if not time to update yet
            speed_kmh = self.last_smoothed_speed if self.last_smoothed_speed >= self.min_speed_threshold else 0.0
        
        # Store current values for next calculation
        self.last_wheel_revs = wheel_revs
        self.last_wheel_time = wheel_time
        
        return speed_kmh, self.total_distance_m / 1000.0  # Convert to km

class EnhancedMenuBarApp(iConsoleMenuBarApp):
    """Enhanced menu bar app with better distance tracking"""
    
    def __init__(self):
        super().__init__()
        
        # Hide from dock using AppKit
        try:
            import AppKit
            AppKit.NSApp.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)
            logger.info("App configured to hide from dock")
        except Exception as e:
            logger.warning(f"Could not hide from dock: {e}")
        
        # Ensure timer is started
        self.start_timer()
        logger.info("Enhanced menu bar app initialized")
    
    def update_data(self):
        """Enhanced update with better logging"""
        try:
            # Get the most recent session file
            session_files = list(self.data_dir.glob("session_*.json"))
            if not session_files:
                self.update_display("No session data", 0.0, "No active session")
                return
            
            # Get the newest session file
            latest_session = max(session_files, key=lambda f: f.stat().st_mtime)
            
            # Read session data
            with open(latest_session, 'r') as f:
                session_data = json.load(f)
            
            if not session_data:
                self.update_display("No data", 0.0, "Session file empty")
                return
            
            # Get the most recent data point
            latest_entry = session_data[-1]
            entry_time = datetime.fromisoformat(latest_entry['timestamp'])
            
            # Check if data is recent (within last 10 seconds)
            time_diff = datetime.now() - entry_time
            self.is_active = time_diff.total_seconds() < 10
            
            # Extract speed and distance
            decoded_data = latest_entry.get('decoded_data', {})
            speed = decoded_data.get('calculated_speed_kmh', 0.0)
            
            # Get total distance from distance file (with fallback to session data)
            total_km = self.get_total_distance()
            
            # Fallback: if no distance file, try to get from session data
            if total_km == 0.0 and 'total_distance_km' in decoded_data:
                total_km = decoded_data['total_distance_km']
                logger.debug(f"Using session distance: {total_km:.3f} km")
            
            # Update display
            if self.is_active:
                status = f"Active • Last: {entry_time.strftime('%H:%M:%S')}"
            else:
                status = f"Inactive • Last: {entry_time.strftime('%H:%M:%S')}"
            
            self.update_display(speed, total_km, status)
            logger.debug(f"Display updated: {speed:.1f} km/h, {total_km:.3f} km")
            
        except Exception as e:
            logger.error(f"Update error: {e}")
            self.update_display("Error", 0.0, f"Error: {str(e)[:30]}...")

class HelthDaemon:
    def __init__(self):
        self.device_address = "5F1372D5-7528-C321-9A48-87BA1DBA6FB9"
        self.iconsole_reader = None
        self.menubar_app = None
        self.background_task = None
        self.running = False
        
    async def start_iconsole_service(self):
        """Start the iConsole background service"""
        logger.info("Starting iConsole background service...")
        
        self.iconsole_reader = FixedConsoleDataReader(self.device_address)
        
        while self.running:
            try:
                if await self.iconsole_reader.connect():
                    logger.info("iConsole connected, starting data stream...")
                    await self.iconsole_reader.start_data_stream()
                else:
                    logger.warning("Failed to connect to iConsole, retrying in 10 seconds...")
                    await asyncio.sleep(10)
            except Exception as e:
                logger.error(f"iConsole service error: {e}")
                await asyncio.sleep(5)  # Wait before retry
            finally:
                if self.iconsole_reader:
                    await self.iconsole_reader.disconnect()
                    
            if self.running:
                logger.info("Reconnecting to iConsole in 5 seconds...")
                await asyncio.sleep(5)
    
    def start_menubar_app(self):
        """Start the menu bar app in the main thread"""
        logger.info("Starting menu bar app...")
        
        # Check if data directory exists
        data_dir = Path.home() / "Documents" / "iConsole_Data"
        data_dir.mkdir(parents=True, exist_ok=True)
        
        self.menubar_app = EnhancedMenuBarApp()
        self.menubar_app.run()
    
    def start_background_service(self):
        """Start the background iConsole service in a separate thread"""
        def run_async_service():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self.start_iconsole_service())
            except Exception as e:
                logger.error(f"Background service failed: {e}")
            finally:
                loop.close()
        
        self.running = True
        self.background_task = threading.Thread(target=run_async_service, daemon=True)
        self.background_task.start()
        logger.info("Background iConsole service started")
    
    def stop(self):
        """Stop the daemon"""
        logger.info("Stopping Helth daemon...")
        self.running = False
        
        if self.menubar_app:
            rumps.quit_application()
    
    def run(self):
        """Run the combined daemon"""
        logger.info("🚴 Helth Daemon Starting")
        logger.info("=" * 50)
        logger.info(f"📱 Device: iConsole+0462")
        logger.info(f"🔗 Address: {self.device_address}")
        logger.info(f"📁 Data directory: {Path.home() / 'Documents' / 'iConsole_Data'}")
        logger.info(f"📋 Log directory: {log_dir}")
        logger.info("=" * 50)
        
        try:
            # Start the background iConsole service
            self.start_background_service()
            
            # Start the menu bar app (this blocks until quit)
            self.start_menubar_app()
            
        except KeyboardInterrupt:
            logger.info("Daemon interrupted by user")
        except Exception as e:
            logger.error(f"Daemon failed: {e}")
            raise
        finally:
            self.stop()

def main():
    """Main entry point"""
    daemon = HelthDaemon()
    daemon.run()

if __name__ == "__main__":
    main()

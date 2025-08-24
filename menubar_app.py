#!/usr/bin/env python3
"""
iConsole Menu Bar App
Displays current speed and cumulative distance in macOS menu bar
"""

import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from threading import Timer
import rumps

class iConsoleMenuBarApp(rumps.App):
    def __init__(self):
        super(iConsoleMenuBarApp, self).__init__("🚴 --", quit_button=None)
        
        # Data paths
        self.data_dir = Path.home() / "Documents" / "iConsole_Data"
        self.distance_file = self.data_dir / "total_distance.json"
        
        # Current stats
        self.current_speed = 0.0
        self.total_distance = 0.0
        self.last_update = None
        self.is_active = False
        
        # Menu items
        self.speed_item = rumps.MenuItem("Speed: -- km/h")
        self.distance_item = rumps.MenuItem("Distance: -- km")
        self.status_item = rumps.MenuItem("Status: Waiting for data...")
        self.separator1 = rumps.separator
        self.refresh_item = rumps.MenuItem("Refresh Now")
        self.separator2 = rumps.separator
        self.quit_item = rumps.MenuItem("Quit")
        
        # Add menu items
        self.menu = [
            self.speed_item,
            self.distance_item,
            self.status_item,
            self.separator1,
            self.refresh_item,
            self.separator2,
            self.quit_item
        ]
        
        # Start updating
        self.update_data()
        self.start_timer()
    
    def start_timer(self):
        """Start the update timer"""
        self.timer = Timer(2.0, self.update_loop)
        self.timer.daemon = True
        self.timer.start()
    
    def update_loop(self):
        """Continuous update loop"""
        self.update_data()
        self.start_timer()  # Schedule next update
    
    def update_data(self):
        """Update speed and distance data"""
        try:
            # Get the most recent session file
            session_files = list(self.data_dir.glob("session_*.json"))
            if not session_files:
                self.update_display("No session data", 0.0, "No active session")
                return
            
            # Get the newest session file
            latest_session = max(session_files, key=os.path.getmtime)
            
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
            
            # Get total distance from distance file
            total_km = self.get_total_distance()
            
            # Update display
            if self.is_active:
                status = f"Active • Last: {entry_time.strftime('%H:%M:%S')}"
            else:
                status = f"Inactive • Last: {entry_time.strftime('%H:%M:%S')}"
            
            self.update_display(speed, total_km, status)
            
        except Exception as e:
            self.update_display("Error", 0.0, f"Error: {str(e)[:30]}...")
    
    def get_total_distance(self):
        """Get total distance from distance file"""
        try:
            if self.distance_file.exists():
                with open(self.distance_file, 'r') as f:
                    data = json.load(f)
                    return data.get('total_km', 0.0)
        except Exception:
            pass
        return 0.0
    
    def update_display(self, speed, distance, status):
        """Update the menu bar display"""
        # Update title bar with both speed and distance
        if isinstance(speed, (int, float)) and speed > 0:
            self.title = f"🚴 {speed:.0f} km/h • {distance:.2f} km"
        else:
            self.title = f"🚴 -- • {distance:.2f} km"
        
        # Update menu items
        if isinstance(speed, (int, float)):
            self.speed_item.title = f"Speed: {speed:.1f} km/h"
        else:
            self.speed_item.title = f"Speed: {speed}"
        
        self.distance_item.title = f"Distance: {distance:.3f} km"
        self.status_item.title = f"Status: {status}"
    
    @rumps.clicked("Refresh Now")
    def refresh_clicked(self, _):
        """Manual refresh"""
        self.update_data()
    
    @rumps.clicked("Quit")
    def quit_clicked(self, _):
        """Quit the app"""
        if hasattr(self, 'timer'):
            self.timer.cancel()
        rumps.quit_application()

def main():
    # Check if data directory exists
    data_dir = Path.home() / "Documents" / "iConsole_Data"
    if not data_dir.exists():
        print("iConsole data directory not found. Make sure the background service is running.")
        return
    
    app = iConsoleMenuBarApp()
    app.run()

if __name__ == "__main__":
    main()

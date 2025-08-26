#!/usr/bin/env python3
"""
iConsole Menu Bar App
Displays current speed and cumulative distance in macOS menu bar
"""

import rumps

class iConsoleMenuBarApp(rumps.App):
    def __init__(self, update_function):
        super(iConsoleMenuBarApp, self).__init__("🚴 --", quit_button=None)
        self.update_function = update_function
        
        # Menu items
        self.speed_item = rumps.MenuItem("Speed: -- km/h")
        self.distance_item = rumps.MenuItem("Distance: -- km")
        self.quit_item = rumps.MenuItem("Quit")
        
        self.menu = [self.speed_item, self.distance_item, rumps.separator, self.quit_item]
    
    def update_display(self, speed, distance):
        """Update the menu bar display"""
        if speed > 0:
            self.title = f"🚴 {speed:.0f} km/h • {distance:.2f} km"
        else:
            self.title = f"🚴 -- • {distance:.2f} km"
        
        self.speed_item.title = f"Speed: {speed:.1f} km/h"
        self.distance_item.title = f"Distance: {distance:.3f} km"
    
    @rumps.clicked("Quit")
    def quit_clicked(self, _):
        rumps.quit_application()

def main(update_function):
    app = iConsoleMenuBarApp(update_function)
    return app

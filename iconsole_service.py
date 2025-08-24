#!/usr/bin/env python3
"""
iConsole Fitness Tracker Service
Runs as a proper macOS background service with permissions
"""

import sys
import os

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import and run the fitness tracker
from fitness_tracker import FitnessMenuBarApp

if __name__ == "__main__":
    app = FitnessMenuBarApp()
    app.run()

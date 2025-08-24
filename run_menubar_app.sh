#!/bin/bash

# iConsole Menu Bar App Launcher
# This script runs the menu bar app that displays speed and distance

cd "/Users/victor/Projects/helth"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Please run the background service first."
    exit 1
fi

source venv/bin/activate

echo "Starting iConsole Menu Bar App..."
echo "This will display your current speed and total distance in the menu bar."
echo "Make sure the background service is running for live data."
echo ""

# Run the menu bar app
python3 menubar_app.py

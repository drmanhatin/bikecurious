#!/bin/bash

# iConsole Background Service Launcher
# This script runs the iConsole data logger as a background service on macOS

cd "/Users/victor/Projects/helth"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Create log directory if it doesn't exist
mkdir -p "$HOME/Library/Logs/iConsole"

echo "Starting iConsole Background Service..."
echo "Data will be logged to: $HOME/Documents/iConsole_Data/"
echo "Service logs: $HOME/Library/Logs/iConsole/iconsole_service.log"
echo ""
echo "To stop the service, press Ctrl+C"
echo "To run in background: nohup ./run_background_service.sh > /dev/null 2>&1 &"
echo ""

# Run the service
python3 iconsole_reader.py

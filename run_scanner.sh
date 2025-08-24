#!/bin/bash
# Quick script to run the Bluetooth scanner

echo "🚴 iConsole Exercise Bike Scanner"
echo "================================="
echo ""
echo "Make sure your exercise bike is:"
echo "✅ Powered on"
echo "✅ In pairing/discoverable mode"
echo "✅ Close to your computer"
echo ""
echo "Press Enter to start scanning..."
read

python3 bluetooth_scanner.py

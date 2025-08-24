# iConsole Exercise Bike Data Reader

This project helps you read and display data from your iConsole Bluetooth-enabled exercise bike in real-time.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Find Your Exercise Bike
```bash
python bluetooth_scanner.py
```
This will:
- Scan for nearby Bluetooth devices
- Highlight potential iConsole devices
- Let you inspect device services and characteristics
- Show you the device's Bluetooth address

### 3. Read Live Data
```bash
python iconsole_reader.py
```
Enter your bike's Bluetooth address when prompted, and the script will:
- Connect to your exercise bike
- Subscribe to data streams
- Display real-time workout data in your console

## 📊 What Data Can You See?

The reader attempts to decode various types of fitness data:

- **🏃 Speed** (km/h)
- **🔄 Cadence** (RPM) 
- **⚡ Power** (watts)
- **📏 Distance** (meters)
- **❤️ Heart Rate** (BPM, if available)
- **📡 Raw data** (for analysis)

## 🔧 How It Works

### Bluetooth Scanner (`bluetooth_scanner.py`)
- Scans for BLE devices in your area
- Identifies potential iConsole devices by name patterns
- Inspects device services and characteristics
- Shows standard fitness service UUIDs

### Data Reader (`iconsole_reader.py`)
- Connects to your specific exercise bike
- Subscribes to fitness data characteristics
- Decodes standard protocols (FTMS, CSC, Power)
- Falls back to custom characteristic discovery
- Displays both raw and decoded data

## 🎯 Supported Protocols

The reader supports these standard Bluetooth fitness protocols:

1. **Fitness Machine Service (FTMS)**
   - Indoor Bike Data characteristic
   - Comprehensive workout metrics

2. **Cycling Speed and Cadence (CSC)**
   - Wheel and crank revolution data
   - Speed and cadence calculations

3. **Cycling Power Service**
   - Instantaneous power measurements
   - Power-related metrics

4. **Custom Protocol Detection**
   - Automatically discovers non-standard characteristics
   - Attempts generic data decoding

## 🛠️ Troubleshooting

### Device Not Found?
- Make sure your exercise bike is powered on
- Put the bike in pairing/discoverable mode
- Move closer to the bike during scanning
- Try scanning multiple times

### Connection Issues?
- Verify the Bluetooth address is correct
- Make sure no other devices are connected to the bike
- Restart Bluetooth on your Mac if needed
- Check that the bike isn't in sleep mode

### No Data Received?
- The bike might use a proprietary protocol
- Check the raw data output for patterns
- Some bikes only send data when actively pedaling
- Try different characteristics from the scanner output

## 📱 Alternative Tools

For additional analysis, you can also use:
- **nRF Connect** (mobile app) - Great for exploring BLE devices
- **Bluetooth Explorer** (macOS) - Apple's developer tool
- **Wireshark** - For advanced protocol analysis

## 🔍 Understanding the Output

### Raw Data
```
📡 [14:30:15] Indoor Bike Data
   Raw data: 0200640032001e00
   Length: 8 bytes
```

### Decoded Data
```
📈 Decoded values:
   🏃 Speed: 25.6 km/h
   🔄 Cadence: 80 RPM
   ⚡ Power: 150 watts
```

## 🚴 Tips for Best Results

1. **Start pedaling** - Many bikes only transmit data when active
2. **Stay close** - Bluetooth range is limited
3. **Check bike settings** - Some bikes have Bluetooth enable/disable options
4. **Be patient** - Initial connection can take a few seconds
5. **Monitor raw data** - Even if decoding fails, raw data shows transmission

## 🤝 Contributing

Found a bug or want to add support for more bike models? Feel free to:
- Report issues with your specific bike model
- Share raw data samples for analysis
- Submit improvements to the decoding algorithms

Happy cycling! 🚴‍♂️
# bikecurious

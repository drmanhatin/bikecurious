# iConsole Fitness Tracker Chrome Extension

A Chrome extension that replicates the functionality of your macOS menu bar app for connecting to iConsole exercise bikes via Bluetooth and tracking fitness data.

## Features

- 🚴 Connect to iConsole exercise bike via Web Bluetooth API
- 📊 Real-time speed monitoring and logging to console
- 📏 Automatic distance calculation and tracking
- 💾 Persistent data storage across sessions
- 🎯 Clean, modern popup interface
- 📱 Extension badge showing current speed
- 🎬 **YouTube Integration** - Automatically pause videos when you stop biking!

## Installation

### Method 1: Load as Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" button
4. Select the `chrome-extension` folder from this project
5. The extension should now appear in your extensions list

### Method 2: Create Icons (Optional)

The extension includes an SVG icon template. For better appearance, convert the SVG to PNG files:

```bash
# Create PNG icons from SVG (requires ImageMagick or similar)
cd chrome-extension/icons
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png  
convert icon.svg -resize 128x128 icon128.png
```

Or use any online SVG to PNG converter.

## Usage

### Initial Setup

1. Make sure your iConsole exercise bike is powered on and in pairing mode
2. Open any webpage in Chrome (the extension needs a webpage context to access Bluetooth)
3. Click the extension icon in the toolbar
4. Click "Connect to Bike" in the popup

### Bluetooth Connection

The extension will prompt you to select your iConsole bike from available Bluetooth devices. The extension looks for:
- Devices with "fitness_machine" service
- Devices with "iConsole" or "Bike" in the name
- Standard fitness equipment Bluetooth services

### Data Monitoring

Once connected:
- Speed data is logged to the browser console every second
- Current speed and total distance are displayed in the popup
- The extension badge shows current speed when cycling
- All data is automatically saved and persists across browser sessions

### Console Logging

Open Chrome DevTools (F12) and check the Console tab to see real-time speed logs:
```
🚴 Speed: 15.2 km/h
📈 Speed updated: 14.8 -> 15.2 km/h
🚴 Current: 15.2 km/h • 2.456 km total
```

### YouTube Integration

When using the extension on YouTube:
- Videos automatically pause when you stop biking (speed drops to 0)
- Videos resume when you start biking again
- Configurable pause delay (1-10 seconds)
- Visual notifications show when videos are paused/resumed
- Can be enabled/disabled in the popup settings

**YouTube Console Logs:**
```
📺 YouTube integration initialized
⏸️ User stopped biking (0.0 km/h), pausing YouTube video in 3s
⏸️ YouTube video paused - user not biking
▶️ User started biking (12.5 km/h), resuming YouTube video
```

## Technical Details

### Bluetooth Characteristics

The extension monitors these standard fitness equipment Bluetooth characteristics:
- **Indoor Bike Data** (`00002ad2-0000-1000-8000-00805f9b34fb`)
- **Cycling Speed and Cadence** (`00002a5b-0000-1000-8000-00805f9b34fb`)  
- **Cycling Power Measurement** (`00002a63-0000-1000-8000-00805f9b34fb`)

### Data Processing

- Speed data is averaged over 1-second intervals
- When no new data is received, speed decays by 33% per second
- Distance is calculated as: `distance += (speed / 3600) * time_interval`
- All data is stored in Chrome's local storage

### Files Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── content.js            # Main Bluetooth handling logic
├── popup.html           # Extension popup interface
├── popup.js             # Popup interaction logic
├── popup.css            # Popup styling
├── background.js        # Background service worker
├── icons/               # Extension icons
│   ├── icon.svg         # SVG icon template
│   ├── icon16.png       # 16x16 icon (optional)
│   ├── icon48.png       # 48x48 icon (optional)
│   └── icon128.png      # 128x128 icon (optional)
└── README.md           # This file
```

## Browser Compatibility

- **Chrome 56+** (Web Bluetooth API support)
- **Edge 79+** (Chromium-based)
- **Opera 43+**

**Note:** Firefox does not support Web Bluetooth API.

## Permissions

The extension requires:
- `storage` - For saving distance and session data
- `activeTab` - For injecting the content script
- Web Bluetooth access (requested when connecting)

## Troubleshooting

### "Web Bluetooth API not supported"
- Make sure you're using Chrome 56+ or Edge 79+
- Ensure you're on a secure (HTTPS) page or localhost

### "No compatible device found"
- Ensure your iConsole bike is powered on and in pairing mode
- Try refreshing the page and reconnecting
- Check that Bluetooth is enabled on your computer

### Connection drops frequently
- Make sure you're within Bluetooth range of the bike
- Check for interference from other Bluetooth devices
- Try restarting both Chrome and the exercise bike

### No speed data appearing
- Check the browser console for error messages
- Verify the bike is actively sending data (try pedaling)
- Some bikes may require you to start a workout first

## Development

To modify the extension:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh button on the extension card
4. Test your changes

### Key Components

- **content.js**: Main Bluetooth logic, data processing, console logging
- **popup.js**: UI interactions, connection management
- **background.js**: Data persistence, extension lifecycle management

## Privacy

- All data is stored locally in your browser
- No data is transmitted to external servers
- Bluetooth connection is direct between your browser and the exercise bike

## License

This extension is provided as-is for personal use with iConsole exercise equipment.

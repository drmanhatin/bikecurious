# iConsole Tracker

A React Native Expo app that connects to iConsole Bluetooth exercise bike receivers to track speed and distance data in real-time.

## Features

- **Bluetooth Connection**: Connects to iConsole exercise bike receivers via Bluetooth Low Energy (BLE)
- **Real-time Data**: Displays current speed (km/h) and total distance (km) [[memory:7161769]]
- **Background Recording**: Continues recording data when the app is in the background
- **Persistent Notification**: Shows current speed and distance in a permanent notification
- **Mock Backend Sync**: Automatically sends data to a mock backend service
- **Data Persistence**: Saves total distance locally and restores on app restart

## Technical Requirements

- **Bare Workflow**: Uses Expo bare workflow for full native functionality
- **React Native Paper**: Modern Material Design UI components
- **Background Tasks**: Uses Expo BackgroundFetch and TaskManager
- **Local Notifications**: Persistent notification with real-time updates
- **AsyncStorage**: Local data persistence

## Setup Instructions

### Prerequisites

- Node.js (v16 or later)
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator or Android Emulator (or physical device)
- Xcode (for iOS development)
- Android Studio (for Android development)

### Installation

1. **Navigate to the project directory:**
   ```bash
   cd iconsole-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install iOS pods (iOS only):**
   ```bash
   cd ios && pod install && cd ..
   ```

### Running the App

#### iOS
```bash
npm run ios
```

#### Android
```bash
npm run android
```

#### Development Server
```bash
npm start
```

## Usage

1. **Launch the App**: Open the iConsole Tracker app on your device
2. **Connect to Device**: Tap "Connect to iConsole" to scan and connect to your exercise bike
3. **Start Exercising**: Once connected, the app will automatically track your speed and distance
4. **Background Mode**: The app continues recording even when minimized
5. **View Data**: Check the persistent notification for real-time updates

## App Architecture

### Services

- **BluetoothService**: Handles BLE connection and data parsing from iConsole devices
- **BackgroundService**: Manages background tasks, notifications, and backend synchronization

### Key Features

- **Speed Calculation**: Extracts speed data from multiple BLE characteristic formats
- **Distance Tracking**: Accumulates distance based on speed over time
- **Data Validation**: Filters out unrealistic speed readings (>50 km/h)
- **Connection Management**: Automatic device discovery and connection handling
- **Error Handling**: Robust error handling with user-friendly alerts

### Bluetooth Protocol Support

The app supports multiple iConsole BLE characteristics:
- **Indoor Bike Data (0x2AD2)**: Direct speed readings
- **Cycling Speed and Cadence (0x2A5B)**: Wheel revolution-based speed calculation
- **Generic Characteristics**: Fallback parsing for unknown formats

### Background Processing

- **Background Fetch**: Updates every 15 seconds minimum
- **Notification Updates**: Real-time speed/distance display
- **Backend Sync**: Automatic data transmission to mock API
- **Data Persistence**: Saves total distance across app sessions

## Permissions

### iOS
- Bluetooth access for device connection
- Background processing for continuous data recording
- Notification permissions for persistent display

### Android
- Bluetooth and location permissions for BLE scanning
- Background processing and wake lock permissions
- Notification permissions

## Troubleshooting

### Common Issues

1. **Bluetooth Connection Failed**
   - Ensure Bluetooth is enabled on your device
   - Make sure the iConsole device is powered on and in pairing mode
   - Try restarting the app and scanning again

2. **Background Recording Not Working**
   - Check that background app refresh is enabled for the app
   - Ensure notification permissions are granted
   - Verify that battery optimization is disabled for the app (Android)

3. **No Speed Data**
   - Verify the iConsole device is transmitting data
   - Check that you're actively pedaling/using the exercise bike
   - Try disconnecting and reconnecting to the device

### Debug Information

The app logs detailed information to the console for debugging:
- Bluetooth scanning and connection status
- Data parsing and speed calculations
- Background task execution
- Backend synchronization results

## Development Notes

- **Large Functions**: The codebase uses larger, comprehensive functions as requested [[memory:7161762]]
- **Related Classes**: Services are organized in single files with related functionality
- **Simple Implementation**: Focuses on essential features without over-complication
- **Distance Units**: All distances are displayed in kilometers [[memory:7161769]]

## License

This project is private and proprietary.

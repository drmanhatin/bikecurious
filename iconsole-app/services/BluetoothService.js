import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { Platform, PermissionsAndroid } from 'react-native';

class BluetoothService {
  constructor() {
    this.manager = null;
    this.device = null;
    this.isConnected = false;
    this.isScanning = false;
    this.isInitialized = false;
    
    // Data tracking
    this.currentSpeed = 0.0;
    this.totalDistance = 0.0;
    this.speedDatapoints = [];
    this.lastDataTime = Date.now();
    this.lastWheelRevs = null;
    this.lastWheelTime = null;
    
    // Callbacks
    this.onSpeedUpdate = null;
    this.onDistanceUpdate = null;
    this.onConnectionChange = null;
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('BluetoothService already initialized');
      return;
    }

    console.log('Initializing BluetoothService...');
    this.manager = new BleManager();
    
    // Load saved distance
    await this.loadTotalDistance();
    
    // Start update worker
    this.startUpdateWorker();
    
    this.isInitialized = true;
    console.log('BluetoothService initialized');
  }

  async loadTotalDistance() {
    try {
      const saved = await AsyncStorage.getItem('totalDistance');
      if (saved) {
        this.totalDistance = parseFloat(saved);
        console.log(`Loaded total distance: ${this.totalDistance.toFixed(3)} km`);
      }
    } catch (error) {
      console.warn('Could not load total distance:', error);
    }
  }

  async saveTotalDistance() {
    try {
      await AsyncStorage.setItem('totalDistance', this.totalDistance.toString());
    } catch (error) {
      console.error('Could not save total distance:', error);
    }
  }

  startUpdateWorker() {
    // Update every second
    this.updateInterval = setInterval(() => {
      const currentTime = Date.now();
      
      // Process speed datapoints
      if (this.speedDatapoints.length > 0) {
        const oldSpeed = this.currentSpeed;
        this.currentSpeed = this.speedDatapoints.reduce((sum, speed) => sum + speed, 0) / this.speedDatapoints.length;
        this.speedDatapoints = [];
        console.log(`Speed updated: ${oldSpeed.toFixed(1)} -> ${this.currentSpeed.toFixed(1)} km/h`);
      } else {
        // Decay speed if no recent data
        const timeSinceData = (currentTime - this.lastDataTime) / 1000;
        if (timeSinceData > 1.0) {
          const oldSpeed = this.currentSpeed;
          const decayFactor = Math.pow(0.67, Math.floor(timeSinceData));
          this.currentSpeed *= decayFactor;
          if (this.currentSpeed < 0.1) {
            this.currentSpeed = 0.0;
          }
        }
      }
      
      // Add distance based on current speed
      if (this.currentSpeed > 0) {
        const distanceIncrement = this.currentSpeed / 3600.0; // km per second
        this.totalDistance += distanceIncrement;
        this.saveTotalDistance();
      }
      
      // Notify callbacks
      if (this.onSpeedUpdate) {
        this.onSpeedUpdate(this.currentSpeed);
      }
      if (this.onDistanceUpdate) {
        this.onDistanceUpdate(this.totalDistance);
      }
    }, 1000);
  }

  // Add test method to simulate data for testing notifications
  startTestData() {
    console.log('🧪 Starting test data simulation...');
    let testSpeed = 0;
    
    setInterval(() => {
      // Simulate varying speed data
      testSpeed = 15 + Math.sin(Date.now() / 10000) * 10; // Speed between 5-25 km/h
      this.addSpeedDatapoint(testSpeed);
      console.log(`🧪 Test data: ${testSpeed.toFixed(1)} km/h`);
    }, 2000);
  }

  stopUpdateWorker() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  addSpeedDatapoint(speed) {
    // Discard unrealistic speeds over 50 km/h
    if (speed > 50.0) {
      console.warn(`Discarding unrealistic speed: ${speed.toFixed(1)} km/h`);
      return;
    }
    
    this.speedDatapoints.push(speed);
    this.lastDataTime = Date.now();
    console.log(`Speed datapoint: ${speed.toFixed(1)} km/h`);
  }

  async requestBluetoothPermissions() {
    try {
      console.log('🔵 Requesting Bluetooth permissions...');
      
      if (!this.manager) {
        throw new Error('BleManager not initialized');
      }

      // Request Android permissions
      if (Platform.OS === 'android') {
        console.log('📱 Requesting Android permissions...');
        try {
          const permissions = [
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ];
          
          console.log('Requesting permissions:', permissions);
          
          const granted = await PermissionsAndroid.requestMultiple(permissions);
          
          console.log('✅ Android permissions result:', granted);
          
          // Check if all permissions were granted
          const allGranted = Object.values(granted).every(
            permission => permission === PermissionsAndroid.RESULTS.GRANTED
          );
          
          if (!allGranted) {
            console.warn('⚠️ Not all permissions granted:', granted);
          } else {
            console.log('✅ All Android permissions granted!');
          }
        } catch (err) {
          console.error('❌ Android permission request failed:', err);
        }
      }
      
      console.log('🔍 Checking Bluetooth state...');
      const state = await this.manager.state();
      console.log('📡 Bluetooth state:', state);
      
      if (state !== 'PoweredOn') {
        throw new Error(`Bluetooth is ${state}. Please enable Bluetooth and try again.`);
      }
      
      console.log('✅ Bluetooth permissions and state OK!');
      return true;
    } catch (error) {
      console.error('❌ Bluetooth permission error:', error);
      throw error;
    }
  }

  async scanForDevices() {
    if (this.isScanning) {
      console.log('Already scanning');
      return;
    }

    if (!this.manager) {
      throw new Error('BleManager not initialized. Call initialize() first.');
    }

    // Request permissions first
    await this.requestBluetoothPermissions();

    console.log('Starting scan for iConsole devices...');
    console.log('Scanning for ALL devices to debug...');
    this.isScanning = true;
    
    let deviceCount = 0;
    const foundDevices = new Set();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log(`Scan timeout after 30 seconds. Found ${deviceCount} total devices.`);
        console.log('Device names found:', Array.from(foundDevices));
        this.manager.stopDeviceScan();
        this.isScanning = false;
        reject(new Error(`Scan timeout - no iConsole device found. Scanned ${deviceCount} devices: ${Array.from(foundDevices).join(', ')}`));
      }, 30000);

      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          clearTimeout(timeout);
          this.isScanning = false;
          reject(error);
          return;
        }

        if (device) {
          deviceCount++;
          const deviceName = device.name || 'Unknown';
          const deviceId = device.id || 'No ID';
          
          if (deviceName !== 'Unknown') {
            foundDevices.add(deviceName);
          }
          
          // Log every device for debugging
          console.log(`Device ${deviceCount}: "${deviceName}" (${deviceId}) RSSI: ${device.rssi}`);
          
          // Check for iConsole (case insensitive, multiple variations)
          const nameToCheck = deviceName.toLowerCase();
          const isIConsole = nameToCheck.includes('iconsole') || 
                           nameToCheck.includes('i-console') || 
                           nameToCheck.includes('console') ||
                           nameToCheck.includes('bike') ||
                           nameToCheck.includes('fitness') ||
                           nameToCheck.includes('exercise');
          
          if (isIConsole) {
            console.log(`🎯 POTENTIAL iConsole device found: "${deviceName}" (${deviceId})`);
            console.log(`Device details: RSSI=${device.rssi}, Connectable=${device.isConnectable}`);
            this.manager.stopDeviceScan();
            this.isScanning = false;
            clearTimeout(timeout);
            resolve(device);
          }
        }
      });
    });
  }

  async connectToDevice(device) {
    try {
      console.log(`Connecting to ${device.name}...`);
      
      this.device = await device.connect();
      await this.device.discoverAllServicesAndCharacteristics();
      
      this.isConnected = true;
      console.log('Connected successfully!');
      
      if (this.onConnectionChange) {
        this.onConnectionChange(true);
      }
      
      // Start listening for data
      await this.subscribeToCharacteristics();
      
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      this.isConnected = false;
      if (this.onConnectionChange) {
        this.onConnectionChange(false);
      }
      throw error;
    }
  }

  async subscribeToCharacteristics() {
    if (!this.device) {
      console.error('No device connected');
      return;
    }

    console.log('Discovering and subscribing to characteristics...');
    
    const services = await this.device.services();
    let subscribedCount = 0;
    
    for (const service of services) {
      console.log(`Service: ${service.uuid}`);
      const characteristics = await service.characteristics();
      
      for (const char of characteristics) {
        console.log(`  Characteristic: ${char.uuid} - Properties: ${char.isNotifiable ? 'notify' : ''} ${char.isIndicatable ? 'indicate' : ''}`);
        
        if (char.isNotifiable || char.isIndicatable) {
          try {
            await char.monitor((error, characteristic) => {
              if (error) {
                console.error(`Monitor error for ${char.uuid}:`, error);
                return;
              }
              
              if (characteristic && characteristic.value) {
                this.handleCharacteristicData(characteristic.uuid, characteristic.value);
              }
            });
            
            console.log(`  -> Successfully subscribed to ${char.uuid}`);
            subscribedCount++;
          } catch (error) {
            console.warn(`  -> Could not subscribe to ${char.uuid}:`, error.message);
          }
        }
      }
    }
    
    if (subscribedCount === 0) {
      console.error('No characteristics could be subscribed to!');
    } else {
      console.log(`Successfully subscribed to ${subscribedCount} characteristics`);
    }
  }

  handleCharacteristicData(uuid, base64Data) {
    try {
      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');
      console.log(`Data from ${uuid.slice(-8)}: ${buffer.toString('hex')} (${buffer.length} bytes)`);
      
      const speed = this.extractSpeed(buffer, uuid);
      if (speed !== null) {
        this.addSpeedDatapoint(speed);
      }
    } catch (error) {
      console.error(`Error handling data from ${uuid}:`, error);
    }
  }

  extractSpeed(buffer, uuid) {
    try {
      // Indoor Bike Data (0x2AD2)
      if (uuid.toLowerCase().includes('2ad2') && buffer.length >= 4) {
        const flags = buffer.readUInt16LE(0);
        if (flags & 0x01) { // Speed present
          const speed = buffer.readUInt16LE(2) / 100.0; // km/h
          return speed;
        }
      }
      
      // Cycling Speed and Cadence (0x2A5B)
      else if (uuid.toLowerCase().includes('2a5b') && buffer.length >= 7) {
        const flags = buffer.readUInt8(0);
        if (flags & 0x01) { // Wheel data present
          const wheelRevs = buffer.readUInt32LE(1);
          const wheelTime = buffer.readUInt16LE(5);
          
          if (this.lastWheelRevs !== null && this.lastWheelTime !== null) {
            let revDiff = wheelRevs - this.lastWheelRevs;
            let timeDiff = wheelTime - this.lastWheelTime;
            
            // Handle time rollover (16-bit counter)
            if (timeDiff < 0) {
              timeDiff += 65536;
            }
            
            if (timeDiff > 0 && revDiff > 0) {
              // Time is in 1/1024 seconds
              const timeSeconds = timeDiff / 1024.0;
              const distanceMeters = revDiff * 1.0525; // wheel circumference
              const speedMs = distanceMeters / timeSeconds;
              const speedKmh = speedMs * 3.6; // Convert m/s to km/h
              
              this.lastWheelRevs = wheelRevs;
              this.lastWheelTime = wheelTime;
              
              return speedKmh;
            }
          }
          
          this.lastWheelRevs = wheelRevs;
          this.lastWheelTime = wheelTime;
        }
      }
      
      // Generic speed extraction for unknown characteristics
      else if (buffer.length >= 2) {
        try {
          const speed = buffer.readUInt16LE(0) / 100.0;
          if (speed >= 0 && speed <= 100) { // Reasonable speed range
            return speed;
          }
        } catch (error) {
          // Ignore parsing errors for generic extraction
        }
      }
    } catch (error) {
      console.debug(`Error extracting speed from ${uuid}:`, error);
    }
    
    return null;
  }

  async disconnect() {
    if (this.device && this.isConnected) {
      try {
        await this.device.cancelConnection();
        console.log('Disconnected from device');
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
    
    this.device = null;
    this.isConnected = false;
    
    if (this.onConnectionChange) {
      this.onConnectionChange(false);
    }
  }

  async findAndConnect() {
    try {
      const device = await this.scanForDevices();
      await this.connectToDevice(device);
      return true;
    } catch (error) {
      console.error('Find and connect error:', error);
      throw error;
    }
  }

  destroy() {
    console.log('Destroying BluetoothService...');
    this.stopUpdateWorker();
    this.disconnect();
    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
    }
    this.isInitialized = false;
  }
}

export default new BluetoothService();

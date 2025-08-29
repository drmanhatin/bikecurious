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
        console.log('BleManager not initialized, reinitializing...');
        this.manager = new BleManager();
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
    const scanStartTime = Date.now();
    console.log(`🔍 [SCAN] Starting device scan at ${new Date().toISOString()}`);
    
    if (this.isScanning) {
      console.log('⚠️ [SCAN] Already scanning - returning empty array');
      return [];
    }

    if (!this.manager) {
      console.log('🔧 [SCAN] BleManager not initialized, reinitializing...');
      this.manager = new BleManager();
    }

    // Request permissions first
    console.log('🔐 [SCAN] Requesting Bluetooth permissions...');
    await this.requestBluetoothPermissions();
    console.log('✅ [SCAN] Bluetooth permissions granted');

    console.log('📡 [SCAN] Starting BLE device scan...');
    console.log('🎯 [SCAN] Scanning for ALL devices (will filter for fitness/cycling devices)');
    this.isScanning = true;
    
    let deviceCount = 0;
    const foundDevices = new Map(); // Use Map to store unique devices by ID
    const devicesByName = new Map(); // Track devices by name for debugging
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const scanDuration = Date.now() - scanStartTime;
        console.log(`⏰ [SCAN] Scan timeout after 15 seconds (actual: ${scanDuration}ms)`);
        console.log(`📊 [SCAN] Scan summary: Found ${deviceCount} total devices in ${scanDuration}ms`);
        
        // Log device breakdown by name
        const deviceNames = Array.from(foundDevices.values()).map(d => d.name || 'Unknown');
        const namedDevices = deviceNames.filter(name => name !== 'Unknown');
        const unknownDevices = deviceNames.filter(name => name === 'Unknown');
        
        console.log(`📱 [SCAN] Named devices (${namedDevices.length}):`, namedDevices);
        console.log(`❓ [SCAN] Unknown devices: ${unknownDevices.length}`);
        
        // Log device name frequency
        const nameFrequency = {};
        deviceNames.forEach(name => {
          nameFrequency[name] = (nameFrequency[name] || 0) + 1;
        });
        console.log(`📈 [SCAN] Device name frequency:`, nameFrequency);
        
        this.manager.stopDeviceScan();
        this.isScanning = false;
        
        // Return all found devices that could be fitness/bike related
        const potentialDevices = Array.from(foundDevices.values()).filter(device => {
          const deviceName = (device.name || '').toLowerCase();
          const isRelevant = deviceName.includes('iconsole') || 
                 deviceName.includes('i-console') || 
                 deviceName.includes('console') ||
                 deviceName.includes('bike') ||
                 deviceName.includes('fitness') ||
                 deviceName.includes('exercise') ||
                 deviceName.includes('cycling') ||
                 deviceName.includes('trainer') ||
                 deviceName.includes('wahoo') ||
                 deviceName.includes('tacx') ||
                 deviceName.includes('elite') ||
                 deviceName.includes('zwift') ||
                 (device.name && device.name.length > 0); // Include any named device as potential option
          
          if (isRelevant) {
            console.log(`✅ [SCAN] Including device: "${device.displayName}" (${device.id}) RSSI: ${device.rssi}`);
          }
          
          return isRelevant;
        });
        
        console.log(`🎯 [SCAN] Filtered to ${potentialDevices.length} relevant devices from ${deviceCount} total`);
        console.log(`⏱️ [SCAN] Scan completed in ${scanDuration}ms`);
        
        resolve(potentialDevices);
      }, 15000);

      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          const scanDuration = Date.now() - scanStartTime;
          console.error(`❌ [SCAN] Scan error after ${scanDuration}ms:`, error);
          clearTimeout(timeout);
          this.isScanning = false;
          reject(error);
          return;
        }

        if (device && device.id && !foundDevices.has(device.id)) {
          deviceCount++;
          const deviceName = device.name || 'Unknown Device';
          const deviceId = device.id || 'No ID';
          const rssi = device.rssi || 'N/A';
          
          // Store device with additional info for dropdown
          const deviceInfo = {
            ...device,
            displayName: deviceName !== 'Unknown Device' ? deviceName : `Device ${deviceId.slice(-4)}`,
            rssi: device.rssi
          };
          foundDevices.set(device.id, deviceInfo);
          
          // Track by name for frequency analysis
          const nameKey = deviceName || 'Unknown';
          if (!devicesByName.has(nameKey)) {
            devicesByName.set(nameKey, []);
          }
          devicesByName.get(nameKey).push(deviceInfo);
          
          // Enhanced device logging
          const timeSinceScanStart = Date.now() - scanStartTime;
          console.log(`📱 [SCAN] Device ${deviceCount} (${timeSinceScanStart}ms): "${deviceName}" (${deviceId.slice(-8)}) RSSI: ${rssi}dBm`);
          
          // Log additional device properties if available
          if (device.serviceUUIDs && device.serviceUUIDs.length > 0) {
            console.log(`   🔧 [SCAN] Services: ${device.serviceUUIDs.slice(0, 3).join(', ')}${device.serviceUUIDs.length > 3 ? '...' : ''}`);
          }
          
          if (device.manufacturerData) {
            console.log(`   🏭 [SCAN] Manufacturer data: ${device.manufacturerData.slice(0, 20)}${device.manufacturerData.length > 20 ? '...' : ''}`);
          }
          
          // Highlight potential iConsole devices
          const nameToCheck = deviceName.toLowerCase();
          if (nameToCheck.includes('iconsole') || nameToCheck.includes('console')) {
            console.log(`   🎯 [SCAN] *** POTENTIAL iCONSOLE DEVICE FOUND! ***`);
          } else if (nameToCheck.includes('bike') || nameToCheck.includes('fitness') || nameToCheck.includes('cycling')) {
            console.log(`   🚴 [SCAN] *** FITNESS/CYCLING DEVICE DETECTED ***`);
          }
          
          // Log scan progress every 10 devices
          if (deviceCount % 10 === 0) {
            const elapsed = Date.now() - scanStartTime;
            const rate = (deviceCount / elapsed * 1000).toFixed(1);
            console.log(`📊 [SCAN] Progress: ${deviceCount} devices in ${elapsed}ms (${rate} devices/sec)`);
          }
        } else if (device && foundDevices.has(device.id)) {
          // Log duplicate device encounters
          const existingDevice = foundDevices.get(device.id);
          const rssiDiff = device.rssi - existingDevice.rssi;
          if (Math.abs(rssiDiff) > 5) { // Only log significant RSSI changes
            console.log(`🔄 [SCAN] Duplicate "${device.name || 'Unknown'}" - RSSI changed by ${rssiDiff > 0 ? '+' : ''}${rssiDiff}dBm`);
          }
        }
      });
    });
  }

  // New method to scan and return first iConsole device (for backward compatibility)
  async scanForFirstIConsoleDevice() {
    const devices = await this.scanForDevices();
    
    // Look for iConsole devices first
    const iConsoleDevice = devices.find(device => {
      const nameToCheck = (device.name || '').toLowerCase();
      return nameToCheck.includes('iconsole') || 
             nameToCheck.includes('i-console') || 
             nameToCheck.includes('console');
    });
    
    if (iConsoleDevice) {
      return iConsoleDevice;
    }
    
    // If no iConsole found, return first fitness-related device
    const fitnessDevice = devices.find(device => {
      const nameToCheck = (device.name || '').toLowerCase();
      return nameToCheck.includes('bike') ||
             nameToCheck.includes('fitness') ||
             nameToCheck.includes('exercise') ||
             nameToCheck.includes('cycling') ||
             nameToCheck.includes('trainer');
    });
    
    if (fitnessDevice) {
      return fitnessDevice;
    }
    
    // If no specific devices found, throw error
    if (devices.length === 0) {
      throw new Error('No Bluetooth devices found. Make sure your iConsole device is powered on and in pairing mode.');
    }
    
    throw new Error(`No iConsole device found. Found ${devices.length} devices: ${devices.map(d => d.displayName).join(', ')}`);
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
      // Standard Cycling Speed and Cadence Service (0x2A5B) - PRIMARY SOURCE
      if (uuid.toLowerCase().includes('2a5b')) {
        console.log(`🚴 Processing CSC Measurement data: ${buffer.toString('hex')} (${buffer.length} bytes)`);
        
        if (buffer.length < 1) {
          console.warn('CSC buffer too short');
          return null;
        }
        
        const flags = buffer.readUInt8(0);
        console.log(`CSC Flags: 0x${flags.toString(16).padStart(2, '0')} (${flags.toString(2).padStart(8, '0')})`);
        
        let offset = 1;
        let speed = null;
        
        // Check if wheel revolution data is present (bit 0)
        if (flags & 0x01) {
          if (buffer.length < offset + 6) {
            console.warn('CSC buffer too short for wheel data');
            return null;
          }
          
          const wheelRevs = buffer.readUInt32LE(offset);
          const wheelTime = buffer.readUInt16LE(offset + 4);
          offset += 6;
          
          console.log(`Wheel: revs=${wheelRevs}, time=${wheelTime} (1/1024s)`);
          
          if (this.lastWheelRevs !== null && this.lastWheelTime !== null) {
            let revDiff = wheelRevs - this.lastWheelRevs;
            let timeDiff = wheelTime - this.lastWheelTime;
            
            // Handle revolution counter rollover (32-bit)
            if (revDiff < 0) {
              revDiff += 4294967296; // 2^32
            }
            
            // Handle time rollover (16-bit counter)
            if (timeDiff < 0) {
              timeDiff += 65536; // 2^16
            }
            
            console.log(`Wheel diff: revs=${revDiff}, time=${timeDiff}`);
            
            if (timeDiff > 0 && revDiff > 0) {
              // Time is in 1/1024 seconds
              const timeSeconds = timeDiff / 1024.0;
              
              // Standard wheel circumference for road bike (700x25c) = 2.105m
              // You can adjust this based on your actual wheel size
              const wheelCircumferenceMeters = 2.105;
              const distanceMeters = revDiff * wheelCircumferenceMeters;
              const speedMs = distanceMeters / timeSeconds;
              const speedKmh = speedMs * 3.6; // Convert m/s to km/h
              
              console.log(`📊 CSC Speed calculation: ${distanceMeters.toFixed(3)}m in ${timeSeconds.toFixed(3)}s = ${speedKmh.toFixed(1)} km/h`);
              
              speed = speedKmh;
            }
          } else {
            console.log('🔄 First wheel data received, storing baseline');
          }
          
          this.lastWheelRevs = wheelRevs;
          this.lastWheelTime = wheelTime;
        }
        
        // Check if crank revolution data is present (bit 1)
        if (flags & 0x02) {
          if (buffer.length < offset + 4) {
            console.warn('CSC buffer too short for crank data');
          } else {
            const crankRevs = buffer.readUInt16LE(offset);
            const crankTime = buffer.readUInt16LE(offset + 2);
            console.log(`Crank: revs=${crankRevs}, time=${crankTime} (1/1024s)`);
            // Could calculate cadence here if needed
          }
        }
        
        return speed;
      }
      
      // Indoor Bike Data (0x2AD2) - SECONDARY SOURCE
      else if (uuid.toLowerCase().includes('2ad2') && buffer.length >= 4) {
        console.log(`🏋️ Processing Indoor Bike data: ${buffer.toString('hex')} (${buffer.length} bytes)`);
        const flags = buffer.readUInt16LE(0);
        console.log(`Indoor Bike Flags: 0x${flags.toString(16).padStart(4, '0')}`);
        
        if (flags & 0x01) { // Instantaneous speed present
          const speed = buffer.readUInt16LE(2) / 100.0; // km/h (resolution 0.01)
          console.log(`📊 Indoor Bike Speed: ${speed.toFixed(1)} km/h`);
          return speed;
        }
      }
      
      // Custom characteristics - try to extract speed data
      else if (uuid.toLowerCase().includes('fff1') || 
               uuid.toLowerCase().includes('ff09') || 
               uuid.toLowerCase().includes('ff02')) {
        console.log(`🔧 Processing custom characteristic ${uuid.slice(-8)}: ${buffer.toString('hex')} (${buffer.length} bytes)`);
        
        // Try multiple parsing approaches for custom data
        if (buffer.length >= 2) {
          // Approach 1: 16-bit little endian with /100 scaling
          try {
            const speed1 = buffer.readUInt16LE(0) / 100.0;
            if (speed1 >= 0 && speed1 <= 100) {
              console.log(`📊 Custom speed (LE/100): ${speed1.toFixed(1)} km/h`);
              return speed1;
            }
          } catch (error) {
            // Continue to next approach
          }
          
          // Approach 2: 16-bit big endian with /100 scaling
          try {
            const speed2 = buffer.readUInt16BE(0) / 100.0;
            if (speed2 >= 0 && speed2 <= 100) {
              console.log(`📊 Custom speed (BE/100): ${speed2.toFixed(1)} km/h`);
              return speed2;
            }
          } catch (error) {
            // Continue to next approach
          }
          
          // Approach 3: Single byte scaling
          try {
            const speed3 = buffer.readUInt8(0);
            if (speed3 >= 0 && speed3 <= 100) {
              console.log(`📊 Custom speed (byte): ${speed3.toFixed(1)} km/h`);
              return speed3;
            }
          } catch (error) {
            // Continue to next approach
          }
        }
        
        console.log(`⚠️ Could not extract speed from custom characteristic ${uuid.slice(-8)}`);
      }
      
      // Generic speed extraction for other unknown characteristics
      else if (buffer.length >= 2) {
        console.log(`🔍 Generic parsing for ${uuid.slice(-8)}: ${buffer.toString('hex')} (${buffer.length} bytes)`);
        try {
          const speed = buffer.readUInt16LE(0) / 100.0;
          if (speed >= 0 && speed <= 100) { // Reasonable speed range
            console.log(`📊 Generic speed: ${speed.toFixed(1)} km/h`);
            return speed;
          }
        } catch (error) {
          // Ignore parsing errors for generic extraction
        }
      }
    } catch (error) {
      console.error(`❌ Error extracting speed from ${uuid}:`, error);
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
      // Ensure manager is available before attempting connection
      if (!this.manager) {
        console.log('BleManager not available, reinitializing...');
        await this.initialize();
      }
      
      const device = await this.scanForFirstIConsoleDevice();
      await this.connectToDevice(device);
      return true;
    } catch (error) {
      console.error('Find and connect error:', error);
      
      // If the error is about destroyed manager, try to reinitialize once
      if (error.message && error.message.includes('BleManager was destroyed')) {
        console.log('BleManager was destroyed, attempting to reinitialize...');
        try {
          await this.initialize();
          const device = await this.scanForFirstIConsoleDevice();
          await this.connectToDevice(device);
          return true;
        } catch (retryError) {
          console.error('Retry after reinitialization failed:', retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  // New method to connect to a specific device by ID
  async connectToDeviceById(deviceId) {
    try {
      if (!this.manager) {
        console.log('BleManager not available, reinitializing...');
        await this.initialize();
      }
      
      console.log(`Connecting to device with ID: ${deviceId}`);
      const device = await this.manager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();
      
      this.device = device;
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

  destroy() {
    console.log('Destroying BluetoothService...');
    this.stopUpdateWorker();
    this.disconnect();
    if (this.manager) {
      try {
        this.manager.destroy();
      } catch (error) {
        console.warn('Error destroying BleManager:', error);
      }
      this.manager = null;
    }
    this.isInitialized = false;
  }
}

export default new BluetoothService();

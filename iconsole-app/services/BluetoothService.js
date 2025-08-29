import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';

class BluetoothService {
  constructor() {
    // Singleton pattern - prevent multiple instances
    if (BluetoothService.instance) {
      return BluetoothService.instance;
    }
    
    this.manager = null;
    this.device = null;
    this.isConnected = false;
    this.isScanning = false;
    this.isConnecting = false; // Prevent concurrent connection attempts
    this.isStartConnectingActive = false; // Prevent multiple startConnecting calls
    this.connectionAttemptInterval = null;
    
    // Callbacks
    this.onConnectionChange = null;
    this.onSpeedUpdate = null;
    this.onDistanceUpdate = null;
    
    // Data
    this.currentSpeed = 0;
    this.totalDistance = 0;
    
    // Store singleton instance
    BluetoothService.instance = this;
  }

  async initialize() {
    console.log('🔧 Initializing BluetoothService...');
    this.manager = new BleManager();
    console.log('✅ BluetoothService initialized');
  }

  async requestPermissions() {
    if (Platform.OS === 'android') {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ];
      
      const granted = await PermissionsAndroid.requestMultiple(permissions);
      console.log('📱 Android permissions:', granted);
    }

    const state = await this.manager.state();
    if (state !== 'PoweredOn') {
      throw new Error(`Bluetooth is ${state}. Please enable Bluetooth.`);
    }
    
    console.log('✅ Bluetooth permissions OK');
  }

  async findIConsoleDevice() {
    // Prevent concurrent scans
    if (this.isScanning) {
      console.log('⚠️ [SCAN] Scan already in progress, waiting for completion...');
      throw new Error('Scan already in progress');
    }
    
    return new Promise((resolve, reject) => {
      const scanStartTime = Date.now();
      console.log('🔍 [SCAN] Starting scan for iConsole device...');
      
      // Set scanning flag immediately
      this.isScanning = true;
      
      let deviceCount = 0;
      
      // Helper function to cleanup scan state
      const cleanupScan = () => {
        try {
          this.manager.stopDeviceScan();
        } catch (error) {
          console.warn('⚠️ [SCAN] Error stopping scan:', error.message);
        }
        this.isScanning = false;
      };

      const timeout = setTimeout(() => {
        const scanDuration = Date.now() - scanStartTime;
        console.log(`⏰ [SCAN] Scan timeout after ${scanDuration}ms`);
        console.log(`📊 [SCAN] Found ${deviceCount} total devices, no iConsole devices detected`);
        
        cleanupScan();
        reject(new Error(`No iConsole device found after scanning ${deviceCount} devices in ${scanDuration}ms`));
      }, 15000); // 15 second timeout

      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('❌ [SCAN] Scan error:', error.message);
          clearTimeout(timeout);
          cleanupScan();
          reject(error);
          return;
        }

        if (device && device.id) {
          deviceCount++;
          
          // Log every 10th device to show progress
          if (deviceCount % 10 === 0) {
            const elapsed = Date.now() - scanStartTime;
            console.log(`📱 [SCAN] Progress: ${deviceCount} devices scanned in ${elapsed}ms`);
          }
          
          if (device.name) {
            const deviceName = device.name.toLowerCase();
            if (deviceName.includes('iconsole') || deviceName.includes('console')) {
              const scanDuration = Date.now() - scanStartTime;
              console.log(`🎯 [SCAN] Found iConsole device: ${device.name} (${device.id}) RSSI: ${device.rssi}dBm`);
              console.log(`🛑 [SCAN] Stopping scan after ${scanDuration}ms to connect immediately!`);
              
              // Stop scanning immediately when any iConsole device is found
              clearTimeout(timeout);
              cleanupScan();
              resolve(device);
              return;
            } else {
              // Log other interesting devices
              if (deviceName.includes('bike') || deviceName.includes('fitness') || deviceName.includes('cycling')) {
                console.log(`🚴 [SCAN] Found fitness device: ${device.name} (${device.rssi}dBm)`);
              }
            }
          }
        }
      });
    });
  }

  async connectToDevice(device) {
    // Prevent concurrent connection attempts
    if (this.isConnecting) {
      throw new Error('Connection already in progress');
    }
    
    this.isConnecting = true;
    const connectionStartTime = Date.now();
    console.log(`🔗 [CONNECT] Starting connection to ${device.name} (${device.id})`);
    console.log(`📊 [CONNECT] Device RSSI: ${device.rssi || 'unknown'} dBm`);
    
    // Stop any ongoing scans to prevent interference
    if (this.isScanning) {
      console.log('🛑 [CONNECT] Stopping scan to prevent interference...');
      this.manager.stopDeviceScan();
      this.isScanning = false;
    }
    
    try {
      // Step 1: Connect to device with timeout
      console.log('🔌 [CONNECT] Step 1: Establishing BLE connection...');
      this.device = await this.withTimeout(
        device.connect(),
        15000, // 15 second timeout
        'Device connection timed out'
      );
      
      const connectTime = Date.now() - connectionStartTime;
      console.log(`✅ [CONNECT] Step 1 completed in ${connectTime}ms`);
      
      // Step 1.5: Wait for device to stabilize after connection
      console.log('⏳ [CONNECT] Waiting for device to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 4000)); // 4 second delay for better stability
      
      // Step 2: Discover services and characteristics with retry
      console.log('🔍 [CONNECT] Step 2: Discovering services and characteristics...');
      const discoveryStartTime = Date.now();
      
      await this.discoverServicesWithRetry();
      
      const discoveryTime = Date.now() - discoveryStartTime;
      console.log(`✅ [CONNECT] Step 2 completed in ${discoveryTime}ms`);
      
      // Step 3: Set connection state
      this.isConnected = true;
      const totalTime = Date.now() - connectionStartTime;
      console.log(`🎉 [CONNECT] Successfully connected to iConsole in ${totalTime}ms!`);
      
      if (this.onConnectionChange) {
        this.onConnectionChange(true);
      }
      
      // Step 3.5: Wait before starting data monitoring
      console.log('⏳ [CONNECT] Waiting before starting data monitoring...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay before notifications
      
      // Step 4: Start monitoring for data
      console.log('📡 [CONNECT] Step 4: Starting data monitoring...');
      await this.startMonitoring();
      
      console.log('🏁 [CONNECT] Connection process completed successfully');
      
    } catch (error) {
      const totalTime = Date.now() - connectionStartTime;
      console.error(`❌ [CONNECT] Connection failed after ${totalTime}ms:`, error.message);
      
      // Cleanup on failure
      if (this.device) {
        try {
          console.log('🧹 [CONNECT] Cleaning up failed connection...');
          await this.device.cancelConnection();
        } catch (cleanupError) {
          console.warn('⚠️ [CONNECT] Cleanup failed:', cleanupError.message);
        }
        this.device = null;
      }
      
      this.isConnected = false;
      if (this.onConnectionChange) {
        this.onConnectionChange(false);
      }
      
      // Provide specific error context
      if (error.message.includes('timeout')) {
        console.error('💡 [CONNECT] Suggestion: Device may be out of range or busy');
      } else if (error.message.includes('disconnected')) {
        console.error('💡 [CONNECT] Suggestion: Device disconnected during connection');
      }
      
      throw error;
    } finally {
      // Always clear the connecting flag
      this.isConnecting = false;
    }
  }

  // Helper method for adding timeouts to promises
  async withTimeout(promise, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      
      promise
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  // Service discovery with retry logic
  async discoverServicesWithRetry(maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🔍 [DISCOVERY] Attempt ${attempt}/${maxAttempts}...`);
        
        // Check if device is still connected
        if (!this.device) {
          throw new Error('Device lost during service discovery');
        }
        
        // Verify connection status
        const isConnected = await this.device.isConnected();
        if (!isConnected) {
          throw new Error('Device disconnected during service discovery');
        }
        
        await this.withTimeout(
          this.device.discoverAllServicesAndCharacteristics(),
          30000, // 30 second timeout
          'Service discovery timed out'
        );
        
        console.log(`✅ [DISCOVERY] Success on attempt ${attempt}`);
        return; // Success, exit retry loop
        
      } catch (error) {
        console.error(`❌ [DISCOVERY] Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === maxAttempts) {
          throw error; // Final attempt failed, throw error
        }
        
        // Wait before retry with exponential backoff
        const delay = attempt * 2000; // 2s, 4s, 6s...
        console.log(`⏳ [DISCOVERY] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async startMonitoring() {
    if (!this.device) {
      console.error('❌ [MONITOR] No device available for monitoring');
      return;
    }
    
    // Verify device is still connected before starting monitoring
    const isConnected = await this.device.isConnected();
    if (!isConnected) {
      console.error('❌ [MONITOR] Device disconnected before monitoring could start');
      return;
    }
    
    console.log('📡 [MONITOR] Starting data monitoring...');
    let subscribedCount = 0;
    
    try {
      const services = await this.device.services();
      console.log(`📋 [MONITOR] Found ${services.length} services`);
      
      for (const service of services) {
        console.log(`🔧 [MONITOR] Service: ${service.uuid}`);
        
        try {
          const characteristics = await service.characteristics();
          
          for (const char of characteristics) {
            const props = [];
            if (char.isNotifiable) props.push('notify');
            if (char.isIndicatable) props.push('indicate');
            
            console.log(`  📊 [MONITOR] Characteristic: ${char.uuid} - Properties: ${props.join(', ')}`);
            
            if (char.isNotifiable || char.isIndicatable) {
              // Check connection before each subscription attempt
              if (!(await this.device.isConnected())) {
                console.warn('⚠️ [MONITOR] Device disconnected during characteristic setup');
                break;
              }
              
              try {
                await char.monitor((error, characteristic) => {
                  if (error) {
                    this.handleMonitorError(char.uuid, error);
                    return;
                  }
                  
                  if (characteristic && characteristic.value) {
                    this.handleData(characteristic.uuid, characteristic.value);
                  }
                });
                
                console.log(`  ✅ [MONITOR] Successfully monitoring ${char.uuid}`);
                subscribedCount++;
                
                // Small delay between subscriptions to prevent overwhelming the device
                await new Promise(resolve => setTimeout(resolve, 100));
                
              } catch (error) {
                this.handleSubscriptionError(char.uuid, error);
              }
            }
          }
        } catch (error) {
          console.warn(`⚠️ [MONITOR] Could not get characteristics for service ${service.uuid}:`, error.message);
        }
      }
      
      if (subscribedCount === 0) {
        console.error('❌ [MONITOR] No characteristics could be subscribed to!');
        throw new Error('Failed to subscribe to any characteristics');
      } else {
        console.log(`✅ [MONITOR] Successfully subscribed to ${subscribedCount} characteristics`);
      }
      
    } catch (error) {
      console.error('❌ [MONITOR] Failed to start monitoring:', error.message);
      throw error;
    }
  }

  handleMonitorError(characteristicUuid, error) {
    const uuid = characteristicUuid.toLowerCase();
    
    // Handle specific error types
    if (error.message && error.message.includes('was disconnected')) {
      console.error(`🔌 [MONITOR] Device disconnected while monitoring ${characteristicUuid}`);
      // Device disconnected - this will trigger reconnection logic
      this.isConnected = false;
      if (this.onConnectionChange) {
        this.onConnectionChange(false);
      }
      return;
    }
    
    if (error.message && error.message.includes('notify change failed')) {
      console.warn(`⚠️ [MONITOR] Characteristic ${characteristicUuid} does not support notifications - ignoring`);
      return; // This is expected for some characteristics
    }
    
    // Log based on characteristic importance
    if (uuid.includes('2a5b')) {
      console.error('🚨 [CRITICAL] CSC Measurement characteristic failed - speed data unavailable!');
      console.error('💡 [SUGGESTION] Move closer to device or check signal strength');
    } else if (uuid.includes('fff1') || uuid.includes('ff09')) {
      console.error('⚠️ [IMPORTANT] Custom iConsole characteristic failed - may affect functionality');
    } else if (uuid.includes('2a05')) {
      console.log('ℹ️ [INFO] Service Changed characteristic not supported - this is normal');
    } else {
      console.warn(`⚠️ [MONITOR] Monitor error for ${characteristicUuid}:`, error.message);
    }
  }

  handleSubscriptionError(characteristicUuid, error) {
    const uuid = characteristicUuid.toLowerCase();
    
    if (uuid.includes('2a5b')) {
      console.warn('🚨 [CRITICAL] Failed to subscribe to CSC Measurement - speed tracking will not work!');
      console.warn('💡 [SOLUTION] Improve signal strength by moving closer to device');
    } else if (uuid.includes('2a05')) {
      console.log('ℹ️ [INFO] Service Changed characteristic subscription failed - this is normal');
    } else {
      console.warn(`⚠️ [MONITOR] Could not subscribe to ${characteristicUuid}:`, error.message);
    }
  }

  handleData(uuid, base64Data) {
    // Simple data handling - you can expand this later
    console.log(`📊 Data from ${uuid.slice(-8)}: ${base64Data}`);
    
    // For now, just trigger callbacks with dummy data
    if (this.onSpeedUpdate) {
      this.onSpeedUpdate(this.currentSpeed);
    }
    if (this.onDistanceUpdate) {
      this.onDistanceUpdate(this.totalDistance);
    }
  }

  async disconnect() {
    if (this.device && this.isConnected) {
      try {
        await this.device.cancelConnection();
        console.log('🔌 Disconnected from device');
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

  // Main method: keeps trying to connect until successful
  async startConnecting() {
    // Prevent multiple startConnecting calls
    if (this.isStartConnectingActive) {
      console.log('⚠️ [MAIN] startConnecting already active, ignoring duplicate call');
      return;
    }
    
    this.isStartConnectingActive = true;
    console.log('🚀 [MAIN] Starting iConsole connection process...');
    
    // Stop any existing attempts
    this.stopConnecting();
    
    // Initialize if needed
    if (!this.manager) {
      await this.initialize();
    }
    
    // Request permissions
    await this.requestPermissions();
    
    let attemptCount = 0;
    let retryDelay = 3000; // Start with 3 seconds
    const maxRetryDelay = 30000; // Max 30 seconds between attempts
    
    // Start connection attempts with exponential backoff
    const attemptConnection = async () => {
      if (this.isConnected) {
        console.log('✅ [MAIN] Already connected, stopping attempts');
        return;
      }
      
      if (this.isScanning) {
        console.log('⏳ [MAIN] Scan in progress, skipping attempt');
        this.scheduleNextAttempt();
        return;
      }
      
      if (this.isConnecting) {
        console.log('🔗 [MAIN] Connection in progress, skipping attempt');
        this.scheduleNextAttempt();
        return;
      }
      
      attemptCount++;
      console.log(`🔄 [MAIN] Connection attempt #${attemptCount} (retry delay: ${retryDelay/1000}s)`);
      
      try {
        const device = await this.findIConsoleDevice();
        await this.connectToDevice(device);
        
        // If we get here, connection was successful
        console.log('🎉 [MAIN] Successfully connected! Stopping connection attempts.');
        this.stopConnecting();
        
        // Reset retry delay for future disconnections
        retryDelay = 3000;
        attemptCount = 0;
        
        // Clear the active flag
        this.isStartConnectingActive = false;
        
      } catch (error) {
        console.log(`⚠️ [MAIN] Attempt #${attemptCount} failed: ${error.message}`);
        
        // Handle specific error types
        if (error.message.includes('Scan already in progress') || 
            error.message.includes('Connection already in progress')) {
          console.log('🔄 [MAIN] Concurrent operation detected, retrying sooner...');
          // Use shorter delay for concurrent operation conflicts
          this.connectionAttemptInterval = setTimeout(attemptConnection, 1000);
          return;
        }
        
        // Increase retry delay with exponential backoff for other errors
        retryDelay = Math.min(retryDelay * 1.5, maxRetryDelay);
        console.log(`⏰ [MAIN] Next attempt in ${retryDelay/1000}s...`);
        
        this.scheduleNextAttempt();
      }
    };
    
    const scheduleNextAttempt = () => {
      this.connectionAttemptInterval = setTimeout(attemptConnection, retryDelay);
    };
    
    this.scheduleNextAttempt = scheduleNextAttempt;
    
    // Try immediately first
    attemptConnection();
  }

  stopConnecting() {
    if (this.connectionAttemptInterval) {
      clearTimeout(this.connectionAttemptInterval);
      this.connectionAttemptInterval = null;
      console.log('⏹️ [MAIN] Stopped connection attempts');
    }
    
    if (this.isScanning) {
      console.log('🛑 [MAIN] Stopping active scan...');
      try {
        this.manager.stopDeviceScan();
      } catch (error) {
        console.warn('⚠️ [MAIN] Error stopping scan:', error.message);
      }
      this.isScanning = false;
    }
    
    // Also clear connecting flag if set
    if (this.isConnecting) {
      console.log('🛑 [MAIN] Clearing connection flag...');
      this.isConnecting = false;
    }
    
    // Clear the startConnecting active flag
    this.isStartConnectingActive = false;
  }

  destroy() {
    console.log('🧹 Destroying BluetoothService...');
    this.stopConnecting();
    this.disconnect();
    
    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
    }
  }
}

export default new BluetoothService();

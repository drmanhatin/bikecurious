import { BleManager, Device, Characteristic, State } from 'react-native-ble-plx';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WorkoutService from './WorkoutService';


export interface SensorData {
  speed: number; // km/h
  distance: number; // km
  timestamp: number;
}

export interface ConnectionStatus {
  isConnected: boolean;
  deviceName?: string;
  deviceId?: string;
}

class BluetoothService {
  private manager: BleManager | null = null;
  private device: Device | null = null;
  private isScanning = false;
  private isConnected = false;
  private dataCallback?: (data: SensorData) => void;
  private connectionCallback?: (status: ConnectionStatus) => void;
  private bluetoothStateCallback?: (state: string) => void;
  
  // Speed tracking
  private speedDatapoints: number[] = [];
  private currentSpeed = 0;
  private lastDataTime = Date.now();
  
  // Distance tracking
  private totalDistanceKm = 0;
  private lastWheelRevs: number | null = null;
  private lastWheelTime: number | null = null;
  
  // Update interval
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadTotalDistance();
    // Try immediate initialization first, then fallback to delayed
    this.tryImmediateInit();
  }

  private async tryImmediateInit(): Promise<void> {
    try {
      console.log('Attempting immediate BLE initialization...');
      this.manager = new BleManager();
      
      // Quick test
      const state = await Promise.race([
        this.manager.state(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      
      console.log('Immediate BLE init successful, state:', state);
      this.setupStateMonitoring();
      this.bluetoothStateCallback?.(String(state));
      
    } catch (error) {
      console.log('Immediate init failed, trying delayed approach:', error);
      this.manager = null;
      
      // Fallback to delayed initialization
      setTimeout(() => {
        this.initializeBleManagerSafely();
      }, 2000);
    }
  }

  private async initializeBleManagerSafely(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 3; // Reduced attempts
    
    console.log('Starting safe BLE initialization...');
    
    while (attempts < maxAttempts && !this.manager) {
      try {
        attempts++;
        console.log(`BLE Manager attempt ${attempts}/${maxAttempts}`);
        
        // Simple delay that increases with each attempt
        const delay = attempts * 1000;
        if (delay > 0) {
          console.log(`Waiting ${delay}ms before attempt...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Create manager directly - no complex checks
        console.log('Creating BleManager...');
        this.manager = new BleManager();
        
        // Test with timeout
        console.log('Testing BLE Manager...');
        const state = await Promise.race([
          this.manager.state(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('State check timeout')), 3000)
          )
        ]);
        
        console.log('BLE Manager ready! State:', state);
        this.setupStateMonitoring();
        this.bluetoothStateCallback?.(String(state));
        return; // Success!
        
      } catch (error) {
        console.error(`BLE Manager attempt ${attempts} failed:`, error);
        
        // Clean up failed manager
        if (this.manager) {
          try {
            this.manager.destroy();
          } catch (destroyError) {
            console.warn('Error destroying failed manager:', destroyError);
          }
        }
        this.manager = null;
        
        // If this was the last attempt, give up
        if (attempts >= maxAttempts) {
          console.error('All BLE Manager attempts failed');
          this.bluetoothStateCallback?.('Failed - Try restarting app');
          return;
        }
      }
    }
    
    // If we get here, all attempts failed
    console.error('BLE Manager initialization completely failed');
    this.bluetoothStateCallback?.('Failed - BLE not available');
  }

  private setupStateMonitoring(): void {
    if (!this.manager) {
      console.error('Cannot setup state monitoring - BLE Manager is null');
      return;
    }
    
    try {
      // Monitor state changes
      this.manager.onStateChange((state) => {
        console.log('BLE State changed:', state);
        this.bluetoothStateCallback?.(state);
      }, true);
    } catch (error) {
      console.error('Error setting up state monitoring:', error);
    }
  }

  private async loadTotalDistance(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('total_distance');
      if (stored) {
        const data = JSON.parse(stored);
        this.totalDistanceKm = data.total_km || 0;
      }
    } catch (error) {
      console.warn('Could not load distance:', error);
    }
  }

  private async saveTotalDistance(): Promise<void> {
    try {
      const data = {
        total_km: this.totalDistanceKm,
        last_updated: new Date().toISOString(),
      };
      await AsyncStorage.setItem('total_distance', JSON.stringify(data));
    } catch (error) {
      console.error('Could not save distance:', error);
    }
  }

  public setDataCallback(callback: (data: SensorData) => void): void {
    this.dataCallback = callback;
  }

  public setConnectionCallback(callback: (status: ConnectionStatus) => void): void {
    this.connectionCallback = callback;
  }

  public setBluetoothStateCallback(callback: (state: string) => void): void {
    this.bluetoothStateCallback = callback;
  }

  private async ensureManagerReady(): Promise<boolean> {
    if (!this.manager) {
      console.log('BLE Manager is null, attempting to reinitialize...');
      await this.initializeBleManagerSafely();
      return this.manager !== null;
    }
    
    // Test if manager is still working
    try {
      await this.manager.state();
      return true;
    } catch (error) {
      console.error('BLE Manager test failed, reinitializing:', error);
      this.manager = null;
      await this.initializeBleManagerSafely();
      return this.manager !== null;
    }
  }

  public async startScanning(): Promise<void> {
    if (this.isScanning) return;

    try {
      // Ensure manager is ready
      const managerReady = await this.ensureManagerReady();
      if (!managerReady) {
        throw new Error('BLE Manager could not be initialized');
      }

      // Wait for BLE to be ready with timeout
      const state = await this.waitForBluetoothReady();
      if (state !== State.PoweredOn) {
        throw new Error(`Bluetooth is not ready. Current state: ${state}`);
      }

      this.isScanning = true;
      console.log('Scanning for iConsole devices...');

      this.manager!.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          this.isScanning = false;
          this.connectionCallback?.({ isConnected: false });
          return;
        }

        if (device) {
          console.log(`Found device: ${device.name || 'Unknown'} (${device.id})`);
          
          // Look for iConsole devices (case-insensitive) or devices that might be iConsole
          const deviceName = (device.name || '').toLowerCase();
          const isIConsole = deviceName.includes('iconsole') || 
                           deviceName.includes('console') ||
                           deviceName.includes('bike') ||
                           deviceName.includes('fitness') ||
                           // Also try connecting to devices that were previously connected (based on logs)
                           device.id === 'D6:94:04:C6:30:46';
          
          if (isIConsole) {
            console.log('Found potential iConsole device:', device.name, device.id);
            this.manager!.stopDeviceScan();
            this.isScanning = false;
            this.connectToDevice(device);
          }
        }
      });

      // Stop scanning after 30 seconds if no device found
      setTimeout(() => {
        if (this.isScanning && this.manager) {
          this.manager.stopDeviceScan();
          this.isScanning = false;
          console.log('Scan timeout - no iConsole device found');
        }
      }, 30000);
    } catch (error) {
      this.isScanning = false;
      throw error;
    }
  }

  private async waitForBluetoothReady(timeoutMs: number = 5000): Promise<State> {
    if (!this.manager) {
      throw new Error('BLE Manager is not initialized');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.remove();
        reject(new Error('Bluetooth ready timeout'));
      }, timeoutMs);

      const subscription = this.manager!.onStateChange((state) => {
        console.log('Waiting for BLE ready, current state:', state);
        this.bluetoothStateCallback?.(state);
        if (state === State.PoweredOn) {
          clearTimeout(timeout);
          subscription.remove();
          resolve(state);
        } else if (state === State.Unauthorized || state === State.Unsupported) {
          clearTimeout(timeout);
          subscription.remove();
          resolve(state);
        }
      }, true);
    });
  }

  public stopScanning(): void {
    if (this.isScanning && this.manager) {
      this.manager.stopDeviceScan();
      this.isScanning = false;
    }
  }

  private async connectToDevice(device: Device): Promise<void> {
    try {
      console.log('Connecting to device:', device.name, device.id);
      
      // Set up disconnection handler before connecting
      device.onDisconnected((error, disconnectedDevice) => {
        console.log('Device disconnected:', disconnectedDevice?.name, error?.message || 'No error');
        this.isConnected = false;
        this.device = null;
        this.connectionCallback?.({ isConnected: false });
        
        // Stop update worker
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
      });
      
      this.device = await device.connect();
      
      console.log('Connected! Discovering services...');
      await this.device.discoverAllServicesAndCharacteristics();
      
      this.isConnected = true;
      this.connectionCallback?.({
        isConnected: true,
        deviceName: device.name || 'Unknown',
        deviceId: device.id,
      });

      // Start workout session for health tracking
      console.log('🏃‍♂️ [HEALTH] Starting workout session for health tracking...');
      const workoutStarted = await WorkoutService.startWorkoutSession();
      if (workoutStarted) {
        console.log('Workout session started - app will remain active in background');
        // Trigger connection callback again to update UI with workout status
        this.connectionCallback?.({
          isConnected: true,
          deviceName: device.name || 'Unknown',
          deviceId: device.id,
        });
      } else {
        console.warn('Failed to start workout session - background activity may be limited');
      }

      await this.subscribeToCharacteristics();
      this.startUpdateWorker();
      
    } catch (error) {
      console.error('Connection error:', error);
      this.isConnected = false;
      this.device = null;
      this.connectionCallback?.({ isConnected: false });
    }
  }

  private async subscribeToCharacteristics(): Promise<void> {
    if (!this.device) return;

    try {
      const services = await this.device.services();
      let subscriptionCount = 0;

      for (const service of services) {
        console.log('Service:', service.uuid);
        const characteristics = await service.characteristics();
        
        for (const char of characteristics) {
          console.log('  Characteristic:', char.uuid, 'Properties:', char.isNotifiable, char.isIndicatable);
          
          if (char.isNotifiable || char.isIndicatable) {
            try {
              await char.monitor((error, characteristic) => {
                if (error) {
                  console.error('Monitor error:', error);
                  return;
                }
                
                if (characteristic?.value) {
                  this.handleCharacteristicData(characteristic);
                }
              });
              
              console.log('  -> Successfully subscribed to', char.uuid);
              subscriptionCount++;
            } catch (error) {
              console.warn('  -> Could not subscribe to', char.uuid, error);
            }
          }
        }
      }

      if (subscriptionCount === 0) {
        console.error('No characteristics could be subscribed to!');
      } else {
        console.log(`Successfully subscribed to ${subscriptionCount} characteristics`);
      }
    } catch (error) {
      console.error('Error subscribing to characteristics:', error);
    }
  }

  private handleCharacteristicData(characteristic: Characteristic): void {
    if (!characteristic.value) return;

    // Convert base64 to Uint8Array (React Native compatible)
    const base64Data = characteristic.value;
    const binaryString = atob(base64Data);
    const data = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      data[i] = binaryString.charCodeAt(i);
    }
    
    console.log(`Received data from ${characteristic.uuid}: ${Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')} (${data.length} bytes)`);
    
    const speed = this.extractSpeed(data, characteristic.uuid);
    if (speed !== null) {
      this.addSpeedDatapoint(speed);
    } else {
      console.debug(`No speed extracted from ${characteristic.uuid} data`);
    }
  }

  private extractSpeed(data: Uint8Array, charUuid: string): number | null {
    try {
      // Helper functions for reading little-endian values
      const readUInt16LE = (offset: number): number => {
        return data[offset] | (data[offset + 1] << 8);
      };
      
      const readUInt32LE = (offset: number): number => {
        return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
      };
      
      // Indoor Bike Data (0x2AD2)
      if (charUuid.includes('2ad2') && data.length >= 4) {
        const flags = readUInt16LE(0);
        if (flags & 0x01) { // Speed present
          const speed = readUInt16LE(2) / 100.0; // km/h
          console.log(`Indoor Bike Data - Speed: ${speed.toFixed(1)} km/h`);
          return speed;
        }
      }
      
      // Cycling Speed and Cadence (0x2A5B)
      else if (charUuid.includes('2a5b') && data.length >= 7) {
        const flags = data[0];
        if (flags & 0x01) { // Wheel data present
          const wheelRevs = readUInt32LE(1);
          const wheelTime = readUInt16LE(5);
          
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
              
              console.log(`Speed & Cadence - Speed: ${speedKmh.toFixed(1)} km/h`);
              
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
      else if (data.length >= 2) {
        try {
          const speed = readUInt16LE(0) / 100.0;
          if (speed >= 0 && speed <= 100) { // Reasonable speed range
            console.log(`Generic extraction - Speed: ${speed.toFixed(1)} km/h`);
            return speed;
          }
        } catch {
          // Ignore parsing errors
        }
      }
      
    } catch (error) {
      console.debug(`Error extracting speed from ${charUuid}:`, error);
    }
    
    return null;
  }

  private addSpeedDatapoint(speed: number): void {
    // Discard unrealistic speed readings over 50 km/h
    if (speed > 50.0) {
      console.warn(`Discarding unrealistic speed reading: ${speed.toFixed(1)} km/h`);
      return;
    }
    
    this.speedDatapoints.push(speed);
    this.lastDataTime = Date.now();
    console.log(`Speed: ${speed.toFixed(1)} km/h`);
  }

  private startUpdateWorker(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      const currentTime = Date.now();
      
      // Process speed datapoints
      if (this.speedDatapoints.length > 0) {
        const oldSpeed = this.currentSpeed;
        this.currentSpeed = this.speedDatapoints.reduce((sum, speed) => sum + speed, 0) / this.speedDatapoints.length;
        this.speedDatapoints = []; // Clear after averaging
        console.log(`Speed updated: ${oldSpeed.toFixed(1)} -> ${this.currentSpeed.toFixed(1)} km/h`);
      } else {
        // No recent data - decay speed by 33% per second
        const timeSinceData = (currentTime - this.lastDataTime) / 1000;
        if (timeSinceData > 1.0) {
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
        this.totalDistanceKm += distanceIncrement;
        this.saveTotalDistance();
      }
      
      // Send data to callback
      const sensorData = {
        speed: this.currentSpeed,
        distance: this.totalDistanceKm,
        timestamp: currentTime,
      };
      
      this.dataCallback?.(sensorData);
      
      // Update workout session with current data
      WorkoutService.updateWorkoutData(this.currentSpeed, this.totalDistanceKm);
      
    }, 1000); // Update every second
  }

  public async disconnect(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.device) {
      try {
        await this.device.cancelConnection();
        console.log('Disconnected from device');
      } catch (error) {
        console.error('Disconnect error:', error);
      }
      this.device = null;
    }

    this.isConnected = false;
    this.connectionCallback?.({ isConnected: false });

    // Stop workout session
    console.log('Stopping workout session...');
    const completedSession = await WorkoutService.stopWorkoutSession();
    if (completedSession) {
      console.log('Workout session completed:', WorkoutService.getWorkoutSummary());
    }
  }

  public getCurrentData(): SensorData {
    return {
      speed: this.currentSpeed,
      distance: this.totalDistanceKm,
      timestamp: Date.now(),
    };
  }

  public async resetDistance(): Promise<void> {
    this.totalDistanceKm = 0;
    await this.saveTotalDistance();
  }

  public getIsScanning(): boolean {
    return this.isScanning;
  }

  public getConnectionStatus(): ConnectionStatus {
    return {
      isConnected: this.isConnected,
      deviceName: this.device?.name || undefined,
      deviceId: this.device?.id,
    };
  }

  public isManagerReady(): boolean {
    return this.manager !== null;
  }

  public async waitForManagerReady(timeoutMs: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    
    while (!this.manager && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return this.manager !== null;
  }

  public async forceReinitialize(): Promise<boolean> {
    console.log('Force reinitializing BLE Manager...');
    
    // Clean up existing manager
    if (this.manager) {
      try {
        this.manager.destroy();
      } catch (error) {
        console.warn('Error destroying existing manager:', error);
      }
      this.manager = null;
    }
    
    // Trigger new initialization
    await this.initializeBleManagerSafely();
    return this.manager !== null;
  }
}

export default new BluetoothService();

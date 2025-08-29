import notifee from '@notifee/react-native';
import BluetoothService from './BluetoothService';
import SpeedReader from './SpeedReader';
import NotificationManager from './NotificationManager';

class ForegroundService {
  constructor() {
    // Singleton pattern - prevent multiple instances
    if (ForegroundService.instance) {
      return ForegroundService.instance;
    }
    
    this.isRunning = false;
    this.updateInterval = null;
    this.hasStartedConnecting = false; // Prevent multiple startConnecting calls
    
    // Store singleton instance
    ForegroundService.instance = this;
  }

  async initialize() {
    await NotificationManager.initialize();
    await BluetoothService.initialize();
    SpeedReader.startReading();
    
    this.setupCallbacks();
  }

  setupCallbacks() {
    SpeedReader.setSpeedUpdateCallback((speed) => {
      this.updateNotificationWithCurrentData();
    });
    
    SpeedReader.setDistanceUpdateCallback((distance) => {
      this.updateNotificationWithCurrentData();
    });
    
    BluetoothService.onConnectionChange = (isConnected) => {
      this.updateNotificationWithCurrentData();
      
      if (isConnected) {
        NotificationManager.showBasicNotification(
          SpeedReader.getCurrentSpeed(),
          SpeedReader.getTotalDistance(),
          true
        );
      } else {
        NotificationManager.showReconnectingNotification(
          0, 10,
          SpeedReader.getCurrentSpeed(),
          SpeedReader.getTotalDistance()
        );
      }
    };
  }

  async registerForegroundService() {
    try {
      await notifee.registerForegroundService((notification) => {
        return new Promise(() => {
          setTimeout(() => {
            try {
              this.startContinuousUpdatesInService();
            } catch (error) {
              // Service setup failed
            }
          }, 100);
        });
      });
    } catch (error) {
      throw error;
    }
  }

  async startForegroundService() {
    if (this.isRunning) return;

    try {
      await this.initialize();
      
      await NotificationManager.showBasicNotification(0, 0);
      await this.registerForegroundService();
      
      this.isRunning = true;
      
      setTimeout(() => {
        try {
          // Start the auto-connecting process (only once)
          if (!this.hasStartedConnecting) {
            console.log('🚀 [FOREGROUND] Starting Bluetooth connection process...');
            this.hasStartedConnecting = true;
            BluetoothService.startConnecting();
          } else {
            console.log('⚠️ [FOREGROUND] Bluetooth connection already started, skipping');
          }
        } catch (error) {
          console.error('Failed to start Bluetooth connection:', error);
        }
      }, 2000);
      
    } catch (error) {
      throw error;
    }
  }

  startContinuousUpdatesInService() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(async () => {
      try {
        this.updateNotificationWithCurrentData();
        
        if (Date.now() % 12000 < 3000) {
          await this.sendToBackend(
            SpeedReader.getCurrentSpeed(),
            SpeedReader.getTotalDistance()
          );
        }
        
      } catch (error) {
        // Update failed
      }
    }, 3000);

    NotificationManager.startNotificationWatchdog();
  }

  updateNotificationWithCurrentData() {
    const speed = SpeedReader.getCurrentSpeed();
    const distance = SpeedReader.getTotalDistance();
    const isConnected = BluetoothService.isConnected;
    
    NotificationManager.updateNotification(speed, distance, isConnected);
  }

  async sendToBackend(speed, distance) {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        speed_kmh: speed,
        total_distance_km: distance,
        device_id: 'iconsole-tracker',
        source: 'foreground_service'
      };

      const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

    } catch (error) {
      // Backend sync failed
    }
  }


  async showForegroundNotification(speed, distance) {
    await NotificationManager.showBasicNotification(speed, distance, BluetoothService.isConnected);
  }

  async updateForegroundNotification(speed, distance) {
    await NotificationManager.updateNotification(speed, distance, BluetoothService.isConnected);
  }

  async testNotificationUpdate(speed = 25.5, distance = 12.34) {
    await NotificationManager.testNotification(speed, distance);
  }

  async promptBatteryOptimization() {
    await NotificationManager.promptBatteryOptimization();
  }

  // Device scanning methods - simplified for new BluetoothService
  getAvailableDevices() {
    // Return empty array since we auto-connect to iConsole
    return [];
  }

  setDevicesFoundCallback(callback) {
    // No longer needed with auto-connect
    console.log('Device found callback not needed with auto-connect');
  }

  async triggerManualScan() {
    console.log('🔄 [FOREGROUND] Manual scan triggered');
    
    // Stop current connection attempts
    BluetoothService.stopConnecting();
    
    // Reset our flag to allow restart
    this.hasStartedConnecting = false;
    
    // Small delay before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Restart the connection process
    if (!this.hasStartedConnecting) {
      console.log('🚀 [FOREGROUND] Restarting Bluetooth connection process...');
      this.hasStartedConnecting = true;
      await BluetoothService.startConnecting();
    }
    
    return [];
  }

  async stopForegroundService() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    NotificationManager.stopNotificationWatchdog();
    BluetoothService.stopConnecting();
    SpeedReader.stopReading();

    try {
      await NotificationManager.hideNotification();
    } catch (error) {
      // Hide notification failed
    }

    // Reset flags for clean restart
    this.isRunning = false;
    this.hasStartedConnecting = false;
  }
}

export default new ForegroundService();

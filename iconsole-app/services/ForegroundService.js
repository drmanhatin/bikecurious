import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { AppState, Platform, Alert } from 'react-native';
import BluetoothService from './BluetoothService';
class ForegroundService {
  constructor() {
    this.isRunning = false;
    this.notificationId = 'iconsole-foreground-notification';
    this.updateInterval = null;
    this.appStateSubscription = null;
    this.reconnectInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // Start with 5 seconds
    this.isReconnecting = false;
    this.notificationSetupComplete = false;
    this.lastNotificationUpdate = 0;
    this.notificationThrottleMs = 1000; // Minimum 1 second between notification updates
    this.notificationCheckInterval = null; // Periodic check to ensure notification exists
    // DON'T call setupNotificationHandlers() in constructor - it blocks the main thread
  }

  // Helper method to create consistent notification configuration
  createNotificationConfig(title, body, options = {}) {
    const {
      progress = null,
      style = null,
      connectionStatus = BluetoothService.isConnected ? '🟢' : '🔴'
    } = options;

    const notification = {
      id: this.notificationId,
      title: title || `🚴 iConsole Tracker ${connectionStatus}`,
      body: body || 'Speed: 0.0 km/h • Distance: 0.00 km',
    };

    // Platform-specific configuration
    if (Platform.OS === 'android') {
      notification.android = {
        channelId: 'iconsole-foreground',
        asForegroundService: true,
        importance: AndroidImportance.LOW, // LOW prevents pop-ups but keeps notification visible
        visibility: AndroidVisibility.PUBLIC, // Visible in notification panel
        ongoing: true, // Makes notification persistent
        autoCancel: false, // Prevents auto-dismissal
        onlyAlertOnce: true, // Only alert once, not on updates
        smallIcon: 'ic_launcher',
        largeIcon: 'ic_launcher',
        silent: true, // Silent notification
        showWhen: false, // No timestamp
        localOnly: true, // Keep notification local to device
        ...(progress && { progress }),
        ...(style && { style }),
      };
    } else if (Platform.OS === 'ios') {
      notification.ios = {
        sound: null, // Silent for iOS
        badge: 1,
        categoryId: 'iconsole-tracker',
      };
    }

    return notification;
  }

  async setupNotificationHandlers() {
    try {
      // Request notification permissions
      const settings = await notifee.requestPermission();
      console.log('📱 Notification permission status:', settings.authorizationStatus);

      // Create notification channel for Android
      if (Platform.OS === 'android') {
        await notifee.createChannel({
          id: 'iconsole-foreground',
          name: 'iConsole Tracker',
          importance: AndroidImportance.LOW, // LOW prevents pop-ups but keeps notification visible
          visibility: AndroidVisibility.PUBLIC, // PUBLIC keeps notification visible in panel
          description: 'Shows current speed and distance while tracking',
          bypassDnd: false, // Respects Do Not Disturb settings
          enableVibration: false, // No vibration
          enableLights: false, // No LED lights
        });
        console.log('📱 Android notification channel created');

        // Check and prompt for battery optimization settings
        await this.checkBatteryOptimization();
      } 
      
      // Setup iOS notification categories
      else if (Platform.OS === 'ios') {
        await notifee.setNotificationCategories([
          {
            id: 'iconsole-tracker',
            actions: [
              {
                id: 'stop',
                title: 'Stop Tracking',
                destructive: true,
              },
            ],
          },
        ]);
        console.log('📱 iOS notification categories created');
      }

      // Set up background event handler to handle notification dismissal
      notifee.onForegroundEvent(async ({ type, detail }) => {
        console.log('📱 Background notification event:', type, detail);
        
        // Handle notification dismissal - recreate it immediately
        if (type === 0 && detail.notification?.id === this.notificationId) { // EventType.DISMISSED = 1
          console.log('⚠️ Foreground notification was dismissed - recreating it');
          
          // Recreate the notification immediately to maintain foreground service
          setTimeout(async () => {
            try {
              const speed = BluetoothService.currentSpeed || 0;
              const distance = BluetoothService.totalDistance || 0;
              await this.showForegroundNotification(speed, distance);
              console.log('✅ Notification recreated after dismissal');
            } catch (error) {
              console.error('❌ Failed to recreate notification after dismissal:', error);
            }
          }, 100); // Small delay to ensure the dismissal is processed
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to setup notification handlers:', error);
    }
  }

  async checkBatteryOptimization() {
    try {
      // Check if battery optimization is enabled
      const batteryOptimizationEnabled = await notifee.isBatteryOptimizationEnabled();
      console.log('🔋 Battery optimization enabled:', batteryOptimizationEnabled);
      
      if (batteryOptimizationEnabled) {
        Alert.alert(
          'Battery Optimization Detected',
          'To ensure continuous speed tracking, please disable battery optimization for iConsole Tracker.',
          [
            {
              text: 'Open Settings',
              onPress: async () => {
                try {
                  await notifee.openBatteryOptimizationSettings();
                } catch (error) {
                  console.error('Failed to open battery settings:', error);
                }
              },
            },
            {
              text: 'Skip',
              style: 'cancel',
              onPress: () => console.log('User skipped battery optimization'),
            },
          ],
          { cancelable: false }
        );
      }

      // Also check power manager settings
      await this.checkPowerManagerSettings();
    } catch (error) {
      console.error('❌ Failed to check battery optimization:', error);
    }
  }

  async checkPowerManagerSettings() {
    try {
      // Get power manager info
      const powerManagerInfo = await notifee.getPowerManagerInfo();
      console.log('⚡ Power manager info:', powerManagerInfo);
      
      if (powerManagerInfo.activity) {
        // Show alert after a delay to avoid overlapping with battery optimization alert
        setTimeout(() => {
          Alert.alert(
            'Power Management Detected',
            'Your device has power management features that may stop background tracking. Please add iConsole Tracker to the whitelist.',
            [
              {
                text: 'Open Settings',
                onPress: async () => {
                  try {
                    await notifee.openPowerManagerSettings();
                  } catch (error) {
                    console.error('Failed to open power manager settings:', error);
                  }
                },
              },
              {
                text: 'Skip',
                style: 'cancel',
                onPress: () => console.log('User skipped power manager settings'),
              },
            ],
            { cancelable: false }
          );
        }, 3000); // 3 second delay
      }
    } catch (error) {
      console.error('❌ Failed to check power manager settings:', error);
    }
  }

  async registerForegroundService() {
    console.log('📱 Registering foreground service...');
    
    try {
      await notifee.registerForegroundService((notification) => {
        console.log('🔥 Foreground service callback triggered!', notification);
        
        return new Promise(() => {
          console.log('✅ Foreground service task registered and running');
          
          // Setup all the monitoring and updates
          setTimeout(() => {
            console.log('🔧 Setting up service components...');
            this.setupAppStateListener();
            this.setupConnectionMonitoring();
            this.setupSpeedDebugging();
            this.startContinuousUpdatesInService();
            console.log('✅ All foreground service setup completed');
          }, 100);
          
          // Long running task - keep the service running until explicitly stopped
          // This promise intentionally never resolves to keep the service alive
        });
      });
      
      console.log('📱 Foreground service registration completed');
    } catch (error) {
      console.error('❌ Failed to register foreground service:', error);
      throw error;
    }
  }

  async startForegroundService() {
    if (this.isRunning) {
      console.log('Foreground service already running');
      return;
    }

    console.log('🚀 Starting foreground service...');

    try {
      // Setup notification channel first (moved from constructor)
      if (!this.notificationSetupComplete) {
        await this.setupNotificationHandlers();
        this.notificationSetupComplete = true;
      }
      
      // Create initial notification first to ensure something shows
      console.log('📱 Creating initial notification...');
      await this.showForegroundNotification(0, 0);
      
      // Register the foreground service properly
      console.log('📱 Registering foreground service...');
      await this.registerForegroundService();
      
      this.isRunning = true;
      console.log('✅ Foreground service started with proper registration');
      
    } catch (error) {
      console.error('❌ Failed to start foreground service:', error);
      throw error;
    }
  }

  async createForegroundServiceNotification() {
    try {
      const connectionStatus = BluetoothService.isConnected ? '🟢' : '🔴';
      
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ${connectionStatus}`,
        `Speed: 0.0 km/h • Distance: 0.00 km`,
        {
          progress: {
            max: 50,
            current: 0,
            indeterminate: false,
          },
          style: {
            type: 1, // BigTextStyle
            text: `Current Speed: 0.0 km/h\nTotal Distance: 0.00 km\nConnection: ${BluetoothService.isConnected ? 'Connected' : 'Disconnected'}`,
          },
          connectionStatus
        }
      );
      
      await notifee.displayNotification(notification);
      console.log('📱 Foreground service notification created and displayed');
    } catch (error) {
      console.error('❌ Failed to create foreground service notification:', error);
      throw error;
    }
  }

  setupAppStateListener() {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      console.log(`📱 App state changed to: ${nextAppState}`);
      
      if (nextAppState === 'background') {
        console.log('🔄 App backgrounded - maintaining Bluetooth connection');
        // Keep Bluetooth connection alive and continue updates
      } else if (nextAppState === 'active') {
        console.log('🔄 App foregrounded - resuming normal operation');
      }
    });
  }

  async setupAppStateListenerAsync() {
    return new Promise((resolve) => {
      // Use setTimeout to make this async and avoid blocking
      setTimeout(() => {
        this.setupAppStateListener();
        resolve();
      }, 0);
    });
  }

  startContinuousUpdatesInService() {
    // Clear any existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Update every 3 seconds - balanced frequency
    this.updateInterval = setInterval(async () => {
      try {
        const speed = BluetoothService.currentSpeed || 0;
        const distance = BluetoothService.totalDistance || 0;
        
        console.log(`🔄 Foreground service update: ${speed.toFixed(1)} km/h, ${distance.toFixed(2)} km`);
        
        // Update notification with proper error handling
        try {
          await this.updateForegroundNotification(speed, distance);
        } catch (notificationError) {
          console.error('❌ Notification update failed, trying fallback:', notificationError);
          await this.showForegroundNotification(speed, distance);
        }
        
        // Send to backend every 12 seconds (4 updates)
        if (Date.now() % 12000 < 3000) {
          await this.sendToBackend(speed, distance);
        }
        
      } catch (error) {
        console.error('❌ Foreground service update error:', error);
      }
    }, 3000); // Every 3 seconds

    console.log('🔄 Started continuous updates in foreground service (every 3s) - USING REAL SENSOR DATA');
    
    // Start periodic notification existence check
    this.startNotificationWatchdog();
  }

  async startContinuousUpdatesInServiceAsync() {
    return new Promise((resolve) => {
      // Use setTimeout to make this async and avoid blocking
      setTimeout(() => {
        this.startContinuousUpdatesInService();
        resolve();
      }, 0);
    });
  }

  setupConnectionMonitoring() {
    console.log('🔍 Setting up Bluetooth connection monitoring...');
    
    // Store the original callback to preserve App.js functionality
    const originalCallback = BluetoothService.onConnectionChange;
    
    // Set up connection change callback that calls both the original and our reconnection logic
    BluetoothService.onConnectionChange = (isConnected) => {
      console.log(`🔄 Connection status changed: ${isConnected ? 'Connected' : 'Disconnected'}`);
      
      // Call the original callback first (for App.js UI updates)
      if (originalCallback) {
        originalCallback(isConnected);
      }
      
      // Then handle our reconnection logic
      if (!isConnected && !this.isReconnecting) {
        console.log('🔄 Connection lost - starting reconnection attempts');
        this.startReconnectionProcess();
      } else if (isConnected && this.isReconnecting) {
        console.log('✅ Reconnection successful - stopping reconnection process');
        this.stopReconnectionProcess();
      }
    };
  }

  async setupConnectionMonitoringAsync() {
    return new Promise((resolve) => {
      // Use setTimeout to make this async and avoid blocking
      setTimeout(() => {
        this.setupConnectionMonitoring();
        resolve();
      }, 0);
    });
  }

  setupSpeedDebugging() {
    console.log('🔍 Setting up speed debugging...');
    
    // Store original callbacks to preserve App.js functionality
    const originalSpeedCallback = BluetoothService.onSpeedUpdate;
    const originalDistanceCallback = BluetoothService.onDistanceUpdate;
    
    // Enhanced speed callback with debugging
    BluetoothService.onSpeedUpdate = (speed) => {
      console.log(`📊 Speed update received: ${speed.toFixed(1)} km/h`);
      
      // Call the original callback first (for App.js UI updates)
      if (originalSpeedCallback) {
        originalSpeedCallback(speed);
      }
    };
    
    // Enhanced distance callback with debugging
    BluetoothService.onDistanceUpdate = (distance) => {
      console.log(`📊 Distance update received: ${distance.toFixed(2)} km`);
      
      // Call the original callback first (for App.js UI updates)
      if (originalDistanceCallback) {
        originalDistanceCallback(distance);
      }
    };
    
    // Log current BluetoothService state
    console.log(`📊 Current BluetoothService state:
      - Connected: ${BluetoothService.isConnected}
      - Current Speed: ${BluetoothService.currentSpeed} km/h
      - Total Distance: ${BluetoothService.totalDistance} km
      - Speed Datapoints: ${BluetoothService.speedDatapoints.length}
      - Initialized: ${BluetoothService.isInitialized}`);
  }

  async setupSpeedDebuggingAsync() {
    return new Promise((resolve) => {
      // Use setTimeout to make this async and avoid blocking
      setTimeout(() => {
        this.setupSpeedDebugging();
        resolve();
      }, 0);
    });
  }

  startNotificationWatchdog() {
    // Clear any existing watchdog
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
    }

    // Check every 10 seconds if notification still exists
    this.notificationCheckInterval = setInterval(async () => {
      try {
        // Get all active notifications
        const notifications = await notifee.getDisplayedNotifications();
        const ourNotification = notifications.find(n => n.id === this.notificationId);
        
        if (!ourNotification && this.isRunning) {
          console.log('⚠️ Foreground notification missing - recreating it');
          const speed = BluetoothService.currentSpeed || 0;
          const distance = BluetoothService.totalDistance || 0;
          await this.showForegroundNotification(speed, distance);
          console.log('✅ Missing notification recreated by watchdog');
        }
      } catch (error) {
        console.error('❌ Notification watchdog error:', error);
      }
    }, 10000); // Every 10 seconds

    console.log('🐕 Notification watchdog started (checking every 10s)');
  }

  stopNotificationWatchdog() {
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
      this.notificationCheckInterval = null;
      console.log('🛑 Notification watchdog stopped');
    }
  }

  async startReconnectionProcess() {
    if (this.isReconnecting) {
      console.log('⚠️ Reconnection already in progress');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts = 0;
    
    console.log('🔄 Starting Bluetooth reconnection process...');
    await this.updateNotificationForReconnection();
    
    this.attemptReconnection();
  }

  async attemptReconnection() {
    if (!this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('❌ Max reconnection attempts reached - giving up');
        await this.updateNotificationForFailedReconnection();
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000); // Max 60 seconds
    
    console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s...`);
    
    await this.updateNotificationForReconnection();

    this.reconnectInterval = setTimeout(async () => {
      try {
        console.log(`🔄 Attempting to reconnect (attempt ${this.reconnectAttempts})...`);
        
        // Try to find and connect to the device
        await BluetoothService.findAndConnect();
        
        if (BluetoothService.isConnected) {
          console.log('✅ Reconnection successful!');
          this.stopReconnectionProcess();
        } else {
          console.log('❌ Reconnection failed - scheduling next attempt');
          this.attemptReconnection();
        }
        
      } catch (error) {
        console.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        this.attemptReconnection();
      }
    }, delay);
  }

  stopReconnectionProcess() {
    console.log('🛑 Stopping reconnection process');
    
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  async updateNotificationForReconnection() {
    try {
      const connectionStatus = this.isReconnecting ? '🔄' : '🔴';
      const statusText = this.isReconnecting 
        ? `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
        : 'Disconnected';
      
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ${connectionStatus}`,
        `${statusText} • Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h`,
        {
          progress: {
            max: this.maxReconnectAttempts,
            current: this.reconnectAttempts,
            indeterminate: this.isReconnecting,
          },
          style: {
            type: 1, // BigTextStyle
            text: `Status: ${statusText}\nCurrent Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h\nTotal Distance: ${BluetoothService.totalDistance?.toFixed(2) || '0.00'} km`,
          },
          connectionStatus
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for reconnection:', error);
    }
  }

  async updateNotificationForFailedReconnection() {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker 🔴`,
        `Connection Failed • Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h`,
        {
          style: {
            type: 1, // BigTextStyle
            text: `Status: Connection Failed - Manual reconnection required\nLast Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h\nTotal Distance: ${BluetoothService.totalDistance?.toFixed(2) || '0.00'} km`,
          },
          connectionStatus: '🔴'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for failed reconnection:', error);
    }
  }

  // Legacy method - kept for backward compatibility but now just calls the service version
  startContinuousUpdates() {
    console.log('⚠️ startContinuousUpdates called - logic moved to foreground service');
    // Logic moved to startContinuousUpdatesInService which runs inside the foreground service
  }

  async showForegroundNotification(speed, distance) {
    try {
      const connectionStatus = BluetoothService.isConnected ? '🟢' : '🔴';
      
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ${connectionStatus}`,
        `Speed: ${speed.toFixed(1)} km/h • Distance: ${distance.toFixed(2)} km`,
        {
          progress: {
            max: 50, // Max speed for progress bar
            current: Math.min(speed, 50),
            indeterminate: false,
          },
          style: {
            type: 1, // BigTextStyle
            text: `Current Speed: ${speed.toFixed(1)} km/h\nTotal Distance: ${distance.toFixed(2)} km\nConnection: ${BluetoothService.isConnected ? 'Connected' : 'Disconnected'}`,
          },
          connectionStatus
        }
      );
      
      await notifee.displayNotification(notification);
      console.log(`📱 Notification displayed: Speed: ${speed.toFixed(1)} km/h • Distance: ${distance.toFixed(2)} km`);
    } catch (error) {
      // Only log foreground service errors once to avoid spam
      if (!this.hasLoggedForegroundError && error.toString().includes('ForegroundServiceStartNotAllowedException')) {
        console.warn('⚠️ Android background restrictions active - using regular notifications');
        this.hasLoggedForegroundError = true;
      } else if (!error.toString().includes('ForegroundServiceStartNotAllowedException')) {
        console.error('❌ Failed to show foreground notification:', error);
        throw error;
      }
    }
  }

  async updateForegroundNotification(speed, distance) {
    try {
      // Throttle notification updates to prevent ANR
      const now = Date.now();
      const timeSinceLastUpdate = now - this.lastNotificationUpdate;
      if (timeSinceLastUpdate < this.notificationThrottleMs) {
        console.log(`📱 Notification update throttled (${timeSinceLastUpdate}ms < ${this.notificationThrottleMs}ms)`);
        return;
      }
      this.lastNotificationUpdate = now;
      console.log(`📱 Notification update allowed (${timeSinceLastUpdate}ms >= ${this.notificationThrottleMs}ms)`);

      const connectionStatus = BluetoothService.isConnected ? '🟢' : '🔴';
      
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ${connectionStatus}`,
        `Speed: ${speed.toFixed(1)} km/h • Distance: ${distance.toFixed(2)} km`,
        {
          progress: {
            max: 50,
            current: Math.min(speed, 50),
            indeterminate: false,
          },
          style: {
            type: 1, // BigTextStyle
            text: `Speed: ${speed.toFixed(1)} km/h\nDistance: ${distance.toFixed(2)} km\nConnection: ${BluetoothService.isConnected ? 'Connected' : 'Disconnected'}`,
          },
          connectionStatus
        }
      );
      
      await notifee.displayNotification(notification);
      console.log(`📱 Notification updated: ${speed.toFixed(1)} km/h, ${distance.toFixed(2)} km`);
    } catch (error) {
      // Only log foreground service errors once to avoid spam
      if (!this.hasLoggedForegroundError && error.toString().includes('ForegroundServiceStartNotAllowedException')) {
        console.warn('⚠️ Android background restrictions active - using regular notifications');
        this.hasLoggedForegroundError = true;
      } else if (!error.toString().includes('ForegroundServiceStartNotAllowedException')) {
        console.error('❌ Failed to update foreground notification:', error);
      }
    }
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

      if (response.ok) {
        console.log('📤 Data sent to backend successfully');
      } else {
        console.warn('⚠️ Backend sync failed:', response.status);
      }
    } catch (error) {
      console.error('❌ Backend sync error:', error);
    }
  }

  // Method to manually test notification updates
  async testNotificationUpdate(speed = 25.5, distance = 12.34) {
    try {
      console.log('🧪 Testing notification update...');
      await this.updateForegroundNotification(speed, distance);
      console.log('✅ Test notification update completed');
    } catch (error) {
      console.error('❌ Test notification update failed:', error);
    }
  }

  // Method to manually check and prompt for battery optimization settings
  async promptBatteryOptimization() {
    if (Platform.OS === 'android') {
      await this.checkBatteryOptimization();
    } else {
      Alert.alert('iOS Device', 'Battery optimization settings are not needed on iOS devices.');
    }
  }

  async stopForegroundService() {
    console.log('🛑 Stopping foreground service...');
    
    // Stop continuous updates
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Stop notification watchdog
    this.stopNotificationWatchdog();

    // Stop reconnection process
    this.stopReconnectionProcess();

    // Remove app state listener
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    // Clear connection change callback
    if (BluetoothService.onConnectionChange) {
      BluetoothService.onConnectionChange = null;
    }

    // Stop the foreground service and hide notification
    try {
      await notifee.cancelNotification(this.notificationId);
      console.log('✅ Foreground service stopped and notification cancelled');
    } catch (error) {
      console.error('Error stopping foreground service:', error);
    }

    this.isRunning = false;
    console.log('✅ Foreground service stopped');
  }
}

export default new ForegroundService();

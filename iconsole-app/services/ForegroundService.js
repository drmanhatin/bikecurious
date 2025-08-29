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
    
    // Device scanning properties
    this.scanInterval = null;
    this.isScanning = false;
    this.availableDevices = [];
    this.lastScanTime = 0;
    this.onDevicesFound = null; // Callback for when devices are found
    
    // Smart scanning configuration
    this.activeScanIntervalMs = 30000; // 30 seconds when app is foreground
    this.reducedScanIntervalMs = 300000; // 5 minutes when screen locked
    this.appInForeground = true; // Track app state
    this.connectionHealthInterval = null;
    this.connectionHealthIntervalMs = 60000; // Check connection health every minute
    
    // Auto-connect configuration
    this.autoConnectEnabled = true; // Enable auto-connect to iConsole devices
    this.autoConnectOnlyInForeground = false; // Allow auto-connect even when app is in background
    
    // Connection stability configuration
    this.connectionStabilityEnabled = true; // Enable connection stability features
    this.keepAliveInterval = null;
    this.keepAliveIntervalMs = 30000; // Send keep-alive every 30 seconds
    this.quickReconnectEnabled = true; // Enable quick reconnection for immediate disconnects
    this.quickReconnectTimeoutMs = 3000; // Consider disconnects within 3 seconds as "quick"
    this.lastConnectionTime = 0;
    this.connectionAttempts = 0;
    this.maxQuickReconnectAttempts = 5;
    
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
        console.log('🔥 Callback notification details:', JSON.stringify(notification, null, 2));
        
        return new Promise(() => {
          console.log('✅ Foreground service task registered and running');
          
          // Setup all the monitoring and updates
          setTimeout(() => {
            console.log('🔧 Setting up service components...');
            try {
              console.log('📱 Setting up app state listener...');
              this.setupAppStateListener();
              console.log('✅ App state listener setup complete');
              
              console.log('🔗 Setting up connection monitoring...');
              this.setupConnectionMonitoring();
              console.log('✅ Connection monitoring setup complete');
              
              console.log('📊 Setting up speed debugging...');
              this.setupSpeedDebugging();
              console.log('✅ Speed debugging setup complete');
              
              console.log('🔄 Starting continuous updates...');
              this.startContinuousUpdatesInService();
              console.log('✅ Continuous updates started');
              
              console.log('🧠 Starting smart scanning...');
              this.startSmartScanning();
              console.log('✅ Smart scanning started');
              
              console.log('✅ All foreground service setup completed');
            } catch (error) {
              console.error('❌ Error during foreground service setup:', error);
            }
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
      
      // Start scanning immediately as fallback (in case callback doesn't trigger)
      console.log('🔍 Starting scanning as fallback after service registration...');
      setTimeout(() => {
        try {
          if (!this.scanInterval) { // Only start if not already started
            console.log('🧠 Fallback: Starting smart scanning...');
            this.startSmartScanning();
          } else {
            console.log('✅ Scanning already started, skipping fallback');
          }
        } catch (error) {
          console.error('❌ Fallback scanning start failed:', error);
        }
      }, 2000); // Wait 2 seconds for callback to potentially trigger first
      
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
      console.log(`📱 [APP-STATE] App state changed to: ${nextAppState}`);
      
      const wasInForeground = this.appInForeground;
      this.appInForeground = nextAppState === 'active';
      
      if (nextAppState === 'background') {
        console.log('🔄 [APP-STATE] App backgrounded - switching to battery-optimized mode');
        console.log('🔋 [APP-STATE] Reducing scan frequency and focusing on connection maintenance');
        this.switchToBackgroundMode();
      } else if (nextAppState === 'active') {
        console.log('🔄 [APP-STATE] App foregrounded - resuming active scanning');
        this.switchToForegroundMode();
      }
      
      // Log state change
      console.log(`📊 [APP-STATE] Scanning mode: ${wasInForeground ? 'foreground' : 'background'} -> ${this.appInForeground ? 'foreground' : 'background'}`);
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
      
      // Then handle our reconnection logic and smart scanning
      if (!isConnected && !this.isReconnecting) {
        const disconnectTime = Date.now();
        const connectionDuration = this.lastConnectionTime ? disconnectTime - this.lastConnectionTime : 0;
        
        console.log(`🔄 [CONNECTION] Connection lost after ${connectionDuration}ms - analyzing disconnect type`);
        
        // Check if this is a quick disconnect (connection lost within a few seconds)
        const isQuickDisconnect = connectionDuration > 0 && connectionDuration < this.quickReconnectTimeoutMs;
        
        if (isQuickDisconnect && this.quickReconnectEnabled && this.connectionAttempts < this.maxQuickReconnectAttempts) {
          console.log(`⚡ [QUICK-RECONNECT] Quick disconnect detected (${connectionDuration}ms) - attempting immediate reconnection (attempt ${this.connectionAttempts + 1}/${this.maxQuickReconnectAttempts})`);
          this.handleQuickReconnect();
        } else {
          if (isQuickDisconnect && this.connectionAttempts >= this.maxQuickReconnectAttempts) {
            console.log(`⚠️ [QUICK-RECONNECT] Max quick reconnect attempts reached (${this.maxQuickReconnectAttempts}) - falling back to normal reconnection`);
          }
          
          console.log('🔄 Connection lost - starting standard reconnection process');
          this.startReconnectionProcess();
          
          // Adjust scanning based on current mode
          if (this.appInForeground) {
            console.log('🌟 [SMART-SCAN] Connection lost in foreground - resuming active scanning');
            this.switchToForegroundMode();
          } else {
            console.log('🌙 [SMART-SCAN] Connection lost in background - starting reduced scanning');
            this.switchToBackgroundMode();
          }
        }
        
        // Stop keep-alive when disconnected
        this.stopKeepAlive();
        
      } else if (isConnected && this.isReconnecting) {
        console.log('✅ Reconnection successful - stopping reconnection process');
        this.stopReconnectionProcess();
        
        // Record successful connection time
        this.lastConnectionTime = Date.now();
        this.connectionAttempts = 0; // Reset quick reconnect attempts
        
        // Start keep-alive for connection stability
        if (this.connectionStabilityEnabled) {
          this.startKeepAlive();
        }
      } else if (isConnected && !this.isReconnecting) {
        // Initial connection established
        console.log('✅ [CONNECTION] Initial connection established');
        this.lastConnectionTime = Date.now();
        this.connectionAttempts = 0;
        
        // Start keep-alive for connection stability
        if (this.connectionStabilityEnabled) {
          this.startKeepAlive();
        }
      }
      
      // Update scanning status based on connection
      if (isConnected) {
        console.log('✅ [SMART-SCAN] Connected - pausing scanning (connection maintenance mode)');
        // Stop scanning when connected - just maintain connection
        if (this.scanInterval) {
          clearInterval(this.scanInterval);
          this.scanInterval = null;
        }
      } else {
        console.log('🔍 [SMART-SCAN] Disconnected - resuming appropriate scanning mode');
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

  // Smart scanning methods - optimized for battery and reliability
  startSmartScanning() {
    const startTime = new Date().toISOString();
    console.log(`🧠 [SMART-SCAN] *** Starting smart scanning at ${startTime} ***`);
    console.log(`⚙️ [SMART-SCAN] Configuration: active=${this.activeScanIntervalMs/1000}s, reduced=${this.reducedScanIntervalMs/1000}s`);
    
    try {
      // Clear any existing intervals
      this.stopSmartScanning();

      // Log initial state
      console.log(`📊 [SMART-SCAN] Initial state: connected=${BluetoothService.isConnected}, foreground=${this.appInForeground}, initialized=${BluetoothService.isInitialized}`);

      // Start connection health monitoring
      this.startConnectionHealthMonitoring();

      // Start appropriate scanning mode
      if (this.appInForeground) {
        this.switchToForegroundMode();
      } else {
        this.switchToBackgroundMode();
      }

      console.log(`🧠 [SMART-SCAN] Smart scanning initialized successfully`);
      
    } catch (error) {
      console.error(`❌ [SMART-SCAN] Error in startSmartScanning():`, error);
      throw error;
    }
  }

  switchToForegroundMode() {
    console.log(`🌟 [SMART-SCAN] Switching to FOREGROUND mode (active scanning)`);
    
    // Clear existing scan interval
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    // Start immediate scan if not connected
    if (!BluetoothService.isConnected && !this.isScanning) {
      console.log('🚀 [SMART-SCAN] Starting immediate foreground scan (not connected)');
      this.performDeviceScan();
    }

    // Set up active scanning interval
    this.scanInterval = setInterval(() => {
      this.handlePeriodicScan('FOREGROUND');
    }, this.activeScanIntervalMs);

    console.log(`🌟 [SMART-SCAN] Foreground mode active (scanning every ${this.activeScanIntervalMs/1000}s when disconnected)`);
  }

  switchToBackgroundMode() {
    console.log(`🌙 [SMART-SCAN] Switching to BACKGROUND mode (reduced scanning)`);
    
    // Clear existing scan interval
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    // Only scan if disconnected - focus on connection maintenance
    if (!BluetoothService.isConnected) {
      console.log('🔋 [SMART-SCAN] Not connected - setting up reduced scanning');
      
      // Set up reduced scanning interval
      this.scanInterval = setInterval(() => {
        this.handlePeriodicScan('BACKGROUND');
      }, this.reducedScanIntervalMs);
      
      console.log(`🌙 [SMART-SCAN] Background mode active (scanning every ${this.reducedScanIntervalMs/1000}s when disconnected)`);
    } else {
      console.log('✅ [SMART-SCAN] Connected - no scanning needed in background mode');
    }
  }

  handlePeriodicScan(mode) {
    const now = new Date().toISOString();
    const timeSinceLastScan = Date.now() - this.lastScanTime;
    
    // Only scan if not connected and not already scanning
    if (!BluetoothService.isConnected && !this.isScanning) {
      console.log(`🔍 [SMART-SCAN-${mode}] Periodic scan triggered at ${now} (${timeSinceLastScan}ms since last scan)`);
      this.performDeviceScan();
    } else if (BluetoothService.isConnected) {
      console.log(`✅ [SMART-SCAN-${mode}] Connected - skipping scan cycle`);
    } else if (this.isScanning) {
      console.log(`⏳ [SMART-SCAN-${mode}] Already scanning - skipping cycle (scan in progress for ${Date.now() - this.lastScanTime}ms)`);
    }
  }

  startConnectionHealthMonitoring() {
    console.log(`💓 [HEALTH] Starting connection health monitoring (every ${this.connectionHealthIntervalMs/1000}s)`);
    
    // Clear existing health monitoring
    if (this.connectionHealthInterval) {
      clearInterval(this.connectionHealthInterval);
    }

    this.connectionHealthInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, this.connectionHealthIntervalMs);
  }

  checkConnectionHealth() {
    const healthTime = new Date().toISOString();
    
    if (BluetoothService.isConnected && BluetoothService.device) {
      console.log(`💓 [HEALTH] Connection health check at ${healthTime} - device connected`);
      
      // Enhanced health check with connection duration
      const connectionDuration = this.lastConnectionTime ? Date.now() - this.lastConnectionTime : 0;
      console.log(`💓 [HEALTH] Device: ${BluetoothService.device.name || 'Unknown'}, Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h, Connected for: ${(connectionDuration/1000).toFixed(1)}s`);
      
      // Check for connection stability issues
      if (connectionDuration > 0 && connectionDuration < 10000) { // Less than 10 seconds
        console.warn(`⚠️ [HEALTH] Recent connection - monitoring for stability (${(connectionDuration/1000).toFixed(1)}s)`);
      }
    } else if (BluetoothService.isConnected && !BluetoothService.device) {
      console.warn(`⚠️ [HEALTH] Inconsistent state: isConnected=true but no device object`);
    } else {
      console.log(`💓 [HEALTH] Not connected - health check skipped`);
    }
  }

  // Quick reconnect for immediate disconnects
  async handleQuickReconnect() {
    this.connectionAttempts++;
    const reconnectId = Math.random().toString(36).substr(2, 4);
    
    console.log(`⚡ [QUICK-RECONNECT-${reconnectId}] Starting quick reconnection attempt ${this.connectionAttempts}/${this.maxQuickReconnectAttempts}`);
    
    try {
      // Update notification for quick reconnect
      await this.updateNotificationForQuickReconnect();
      
      // Short delay before reconnecting (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to reconnect using the last known device
      if (BluetoothService.device && BluetoothService.device.id) {
        console.log(`⚡ [QUICK-RECONNECT-${reconnectId}] Attempting to reconnect to last device: ${BluetoothService.device.id.slice(-8)}`);
        await BluetoothService.connectToDeviceById(BluetoothService.device.id);
        console.log(`✅ [QUICK-RECONNECT-${reconnectId}] Quick reconnection successful!`);
      } else {
        console.log(`⚡ [QUICK-RECONNECT-${reconnectId}] No last device available - falling back to scan and connect`);
        await BluetoothService.findAndConnect();
        console.log(`✅ [QUICK-RECONNECT-${reconnectId}] Quick reconnection via scan successful!`);
      }
      
    } catch (error) {
      console.error(`❌ [QUICK-RECONNECT-${reconnectId}] Quick reconnection failed:`, error);
      
      // If quick reconnect fails, fall back to normal reconnection
      if (this.connectionAttempts >= this.maxQuickReconnectAttempts) {
        console.log(`⚠️ [QUICK-RECONNECT-${reconnectId}] Max attempts reached - switching to normal reconnection`);
        this.startReconnectionProcess();
      } else {
        // Try again after a short delay
        setTimeout(() => {
          if (!BluetoothService.isConnected) {
            this.handleQuickReconnect();
          }
        }, 1000);
      }
    }
  }

  // Keep-alive mechanism to maintain connection stability
  startKeepAlive() {
    if (!this.connectionStabilityEnabled) {
      return;
    }
    
    console.log(`💓 [KEEP-ALIVE] Starting connection keep-alive (every ${this.keepAliveIntervalMs/1000}s)`);
    
    // Clear existing keep-alive
    this.stopKeepAlive();
    
    this.keepAliveInterval = setInterval(() => {
      this.performKeepAlive();
    }, this.keepAliveIntervalMs);
  }

  stopKeepAlive() {
    if (this.keepAliveInterval) {
      console.log(`💓 [KEEP-ALIVE] Stopping connection keep-alive`);
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  async performKeepAlive() {
    if (!BluetoothService.isConnected || !BluetoothService.device) {
      console.log(`💓 [KEEP-ALIVE] Not connected - skipping keep-alive`);
      return;
    }
    
    const keepAliveTime = new Date().toISOString();
    const connectionDuration = this.lastConnectionTime ? Date.now() - this.lastConnectionTime : 0;
    
    try {
      console.log(`💓 [KEEP-ALIVE] Performing keep-alive check at ${keepAliveTime} (connected for ${(connectionDuration/1000).toFixed(1)}s)`);
      
      // Simple keep-alive: check if device is still reachable
      const isConnected = await BluetoothService.device.isConnected();
      
      if (isConnected) {
        console.log(`💓 [KEEP-ALIVE] Device responsive - connection stable`);
        
        // Optional: Read a characteristic to ensure data flow
        try {
          const services = await BluetoothService.device.services();
          if (services && services.length > 0) {
            console.log(`💓 [KEEP-ALIVE] Services accessible - ${services.length} services available`);
          }
        } catch (serviceError) {
          console.warn(`⚠️ [KEEP-ALIVE] Service check failed (but device still connected):`, serviceError.message);
        }
        
      } else {
        console.warn(`⚠️ [KEEP-ALIVE] Device not responsive - connection may be unstable`);
      }
      
    } catch (error) {
      console.error(`❌ [KEEP-ALIVE] Keep-alive check failed:`, error);
      console.log(`🔄 [KEEP-ALIVE] Connection may be lost - monitoring for disconnect event`);
    }
  }

  async updateNotificationForQuickReconnect() {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ⚡`,
        `Quick reconnecting... (${this.connectionAttempts}/${this.maxQuickReconnectAttempts})`,
        {
          progress: {
            max: this.maxQuickReconnectAttempts,
            current: this.connectionAttempts,
            indeterminate: true,
          },
          style: {
            type: 1, // BigTextStyle
            text: `Status: Quick reconnection in progress...\nAttempt: ${this.connectionAttempts}/${this.maxQuickReconnectAttempts}\nConnection lost after brief period`,
          },
          connectionStatus: '⚡'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for quick reconnect:', error);
    }
  }

  async autoConnectToDevice(device, scanId) {
    const connectStartTime = Date.now();
    console.log(`🚀 [AUTO-CONNECT-${scanId}] Starting auto-connection to "${device.displayName}"`);
    
    try {
      // Set connecting state to prevent other connection attempts
      BluetoothService.isConnecting = true;
      
      // Update notification to show connecting status
      await this.updateNotificationForAutoConnect(device);
      
      // Use BluetoothService to connect to the specific device
      console.log(`🔌 [AUTO-CONNECT-${scanId}] Calling BluetoothService.connectToDeviceById("${device.id}")`);
      await BluetoothService.connectToDeviceById(device.id);
      
      const connectDuration = Date.now() - connectStartTime;
      console.log(`✅ [AUTO-CONNECT-${scanId}] Auto-connection successful in ${connectDuration}ms!`);
      console.log(`🎯 [AUTO-CONNECT-${scanId}] Connected to: "${device.displayName}" (${device.id.slice(-8)})`);
      
      // Record connection time for stability tracking
      this.lastConnectionTime = Date.now();
      this.connectionAttempts = 0;
      
      // Start keep-alive for connection stability
      if (this.connectionStabilityEnabled) {
        console.log(`💓 [AUTO-CONNECT-${scanId}] Starting keep-alive for connection stability`);
        this.startKeepAlive();
      }
      
      // Update notification to show successful connection
      await this.updateNotificationForAutoConnectSuccess(device);
      
      // Notify the app about the auto-connection (if callback is set)
      if (this.onDevicesFound && typeof this.onDevicesFound === 'function') {
        console.log(`📞 [AUTO-CONNECT-${scanId}] Notifying app about successful auto-connection`);
        try {
          // Update the available devices list to include the connected device
          this.availableDevices = this.availableDevices.map(d => 
            d.id === device.id ? { ...d, isConnected: true } : d
          );
          this.onDevicesFound(this.availableDevices);
        } catch (callbackError) {
          console.error(`❌ [AUTO-CONNECT-${scanId}] App notification error:`, callbackError);
        }
      }
      
    } catch (error) {
      const connectDuration = Date.now() - connectStartTime;
      console.error(`❌ [AUTO-CONNECT-${scanId}] Auto-connection failed after ${connectDuration}ms:`, error);
      console.error(`❌ [AUTO-CONNECT-${scanId}] Error details:`, {
        message: error.message,
        deviceName: device.displayName,
        deviceId: device.id.slice(-8),
        rssi: device.rssi
      });
      
      // Update notification to show connection failure
      await this.updateNotificationForAutoConnectFailure(device, error);
      
      // Reset connecting state
      BluetoothService.isConnecting = false;
      
    } finally {
      const totalDuration = Date.now() - connectStartTime;
      console.log(`🏁 [AUTO-CONNECT-${scanId}] Auto-connection attempt completed - total duration: ${totalDuration}ms`);
    }
  }

  async updateNotificationForAutoConnect(device) {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker 🚀`,
        `Auto-connecting to ${device.displayName}...`,
        {
          progress: {
            max: 100,
            current: 0,
            indeterminate: true,
          },
          style: {
            type: 1, // BigTextStyle
            text: `Status: Auto-connecting to iConsole device...\nDevice: ${device.displayName}\nSignal: ${device.rssi}dBm`,
          },
          connectionStatus: '🚀'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for auto-connect:', error);
    }
  }

  async updateNotificationForAutoConnectSuccess(device) {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker 🟢`,
        `Auto-connected to ${device.displayName}!`,
        {
          style: {
            type: 1, // BigTextStyle
            text: `Status: Successfully auto-connected!\nDevice: ${device.displayName}\nReady to track speed and distance`,
          },
          connectionStatus: '🟢'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for auto-connect success:', error);
    }
  }

  async updateNotificationForAutoConnectFailure(device, error) {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ⚠️`,
        `Auto-connect to ${device.displayName} failed`,
        {
          style: {
            type: 1, // BigTextStyle
            text: `Status: Auto-connection failed\nDevice: ${device.displayName}\nError: ${error.message}\nWill continue scanning...`,
          },
          connectionStatus: '⚠️'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for auto-connect failure:', error);
    }
  }

  async performDeviceScan() {
    const scanId = Math.random().toString(36).substr(2, 6); // Generate unique scan ID
    const scanStartTime = Date.now();
    const scanStartISO = new Date().toISOString();
    
    console.log(`🔍 [FG-SCAN-${scanId}] Starting background device scan at ${scanStartISO}`);
    
    if (this.isScanning) {
      const ongoingScanDuration = Date.now() - this.lastScanTime;
      console.log(`⚠️ [FG-SCAN-${scanId}] Scan already in progress for ${ongoingScanDuration}ms - aborting`);
      return;
    }

    if (!BluetoothService.isInitialized) {
      console.log(`⚠️ [FG-SCAN-${scanId}] BluetoothService not initialized - skipping scan`);
      return;
    }

    // Log scan context
    const timeSinceLastScan = this.lastScanTime ? Date.now() - this.lastScanTime : 'never';
    console.log(`📊 [FG-SCAN-${scanId}] Scan context: last_scan=${timeSinceLastScan}ms ago, cached_devices=${this.availableDevices.length}, connected=${BluetoothService.isConnected}`);

    this.isScanning = true;
    this.lastScanTime = scanStartTime;
    
    try {
      console.log(`🔍 [FG-SCAN-${scanId}] Performing background device scan...`);
      
      // Update notification to show scanning status
      console.log(`📱 [FG-SCAN-${scanId}] Updating notification for scanning status`);
      await this.updateNotificationForScanning();
      
      // Scan for devices
      console.log(`📡 [FG-SCAN-${scanId}] Calling BluetoothService.scanForDevices()`);
      const devices = await BluetoothService.scanForDevices();
      
      const scanDuration = Date.now() - scanStartTime;
      console.log(`📡 [FG-SCAN-${scanId}] Background scan completed in ${scanDuration}ms - found ${devices.length} devices`);
      
      // Log device details
      if (devices.length > 0) {
        console.log(`📱 [FG-SCAN-${scanId}] Device breakdown:`);
        devices.forEach((device, index) => {
          console.log(`   ${index + 1}. "${device.displayName}" (${device.id.slice(-8)}) RSSI: ${device.rssi}dBm`);
        });
        
        // Highlight iConsole devices and auto-connect
        const iConsoleDevices = devices.filter(d => 
          (d.name || '').toLowerCase().includes('iconsole') || 
          (d.name || '').toLowerCase().includes('console')
        );
        if (iConsoleDevices.length > 0) {
          console.log(`🎯 [FG-SCAN-${scanId}] Found ${iConsoleDevices.length} potential iConsole device(s):`);
          iConsoleDevices.forEach(device => {
            console.log(`   🎯 "${device.displayName}" (${device.id.slice(-8)}) RSSI: ${device.rssi}dBm`);
          });
          
          // Auto-connect to the first (strongest signal) iConsole device found
          if (this.autoConnectEnabled && !BluetoothService.isConnected && !BluetoothService.isConnecting) {
            // Check if auto-connect is allowed in current mode
            const allowAutoConnect = !this.autoConnectOnlyInForeground || this.appInForeground;
            
            if (allowAutoConnect) {
              const bestDevice = iConsoleDevices.reduce((best, current) => 
                (current.rssi > best.rssi) ? current : best
              );
              
              console.log(`🚀 [FG-SCAN-${scanId}] Auto-connecting to best iConsole device: "${bestDevice.displayName}" (RSSI: ${bestDevice.rssi}dBm)`);
              console.log(`📊 [FG-SCAN-${scanId}] Auto-connect context: enabled=${this.autoConnectEnabled}, foreground=${this.appInForeground}, onlyInForeground=${this.autoConnectOnlyInForeground}`);
              
              // Trigger auto-connection
              this.autoConnectToDevice(bestDevice, scanId);
            } else {
              console.log(`⚠️ [FG-SCAN-${scanId}] iConsole device found but auto-connect disabled in background mode`);
            }
          } else if (!this.autoConnectEnabled) {
            console.log(`⚠️ [FG-SCAN-${scanId}] iConsole device found but auto-connect is disabled`);
          } else {
            console.log(`⚠️ [FG-SCAN-${scanId}] iConsole device found but already connected/connecting - skipping auto-connect`);
          }
        }
      } else {
        console.log(`❓ [FG-SCAN-${scanId}] No devices found - check if Bluetooth is enabled and devices are in range`);
      }
      
      // Compare with previous scan results
      const previousDeviceCount = this.availableDevices.length;
      const newDevices = devices.filter(d => !this.availableDevices.some(existing => existing.id === d.id));
      const lostDevices = this.availableDevices.filter(existing => !devices.some(d => d.id === existing.id));
      
      if (newDevices.length > 0) {
        console.log(`🆕 [FG-SCAN-${scanId}] New devices found: ${newDevices.map(d => d.displayName).join(', ')}`);
      }
      if (lostDevices.length > 0) {
        console.log(`📉 [FG-SCAN-${scanId}] Devices no longer visible: ${lostDevices.map(d => d.displayName).join(', ')}`);
      }
      
      // Update available devices list
      console.log(`💾 [FG-SCAN-${scanId}] Updating device cache: ${previousDeviceCount} -> ${devices.length} devices`);
      this.availableDevices = devices;
      
      // Notify callback if set (for App.js integration)
      if (this.onDevicesFound && typeof this.onDevicesFound === 'function') {
        console.log(`📞 [FG-SCAN-${scanId}] Calling onDevicesFound callback with ${devices.length} devices`);
        try {
          this.onDevicesFound(devices);
          console.log(`✅ [FG-SCAN-${scanId}] Callback executed successfully`);
        } catch (callbackError) {
          console.error(`❌ [FG-SCAN-${scanId}] Callback error:`, callbackError);
        }
      } else {
        console.log(`📞 [FG-SCAN-${scanId}] No callback set - skipping notification`);
      }
      
      // Update notification with scan results
      console.log(`📱 [FG-SCAN-${scanId}] Updating notification with scan results`);
      await this.updateNotificationForScanResults(devices.length);
      
      console.log(`✅ [FG-SCAN-${scanId}] Background scan completed successfully in ${scanDuration}ms`);
      
    } catch (error) {
      const scanDuration = Date.now() - scanStartTime;
      console.error(`❌ [FG-SCAN-${scanId}] Background device scan failed after ${scanDuration}ms:`, error);
      console.error(`❌ [FG-SCAN-${scanId}] Error details:`, {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
        name: error.name
      });
      
      await this.updateNotificationForScanError();
    } finally {
      const totalDuration = Date.now() - scanStartTime;
      this.isScanning = false;
      console.log(`🏁 [FG-SCAN-${scanId}] Scan cleanup completed - total duration: ${totalDuration}ms`);
    }
  }

  async updateNotificationForScanning() {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker 🔍`,
        `Scanning for devices... • Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h`,
        {
          progress: {
            max: 100,
            current: 0,
            indeterminate: true,
          },
          style: {
            type: 1, // BigTextStyle
            text: `Status: Scanning for nearby iConsole devices...\nCurrent Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h\nTotal Distance: ${BluetoothService.totalDistance?.toFixed(2) || '0.00'} km`,
          },
          connectionStatus: '🔍'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for scanning:', error);
    }
  }

  async updateNotificationForScanResults(deviceCount) {
    try {
      const connectionStatus = BluetoothService.isConnected ? '🟢' : '🔴';
      const statusText = BluetoothService.isConnected 
        ? 'Connected' 
        : `Found ${deviceCount} device${deviceCount !== 1 ? 's' : ''}`;
      
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ${connectionStatus}`,
        `${statusText} • Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h`,
        {
          progress: {
            max: 50,
            current: Math.min(BluetoothService.currentSpeed || 0, 50),
            indeterminate: false,
          },
          style: {
            type: 1, // BigTextStyle
            text: `Status: ${statusText}\nCurrent Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h\nTotal Distance: ${BluetoothService.totalDistance?.toFixed(2) || '0.00'} km\nLast scan: ${new Date().toLocaleTimeString()}`,
          },
          connectionStatus
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for scan results:', error);
    }
  }

  async updateNotificationForScanError() {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ⚠️`,
        `Scan failed • Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h`,
        {
          style: {
            type: 1, // BigTextStyle
            text: `Status: Device scan failed - will retry in ${this.scanIntervalMs/1000}s\nCurrent Speed: ${BluetoothService.currentSpeed?.toFixed(1) || '0.0'} km/h\nTotal Distance: ${BluetoothService.totalDistance?.toFixed(2) || '0.00'} km`,
          },
          connectionStatus: '⚠️'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      console.error('❌ Failed to update notification for scan error:', error);
    }
  }

  stopSmartScanning() {
    const stopTime = new Date().toISOString();
    console.log(`🛑 [SMART-SCAN] Stopping smart scanning at ${stopTime}`);
    
    // Stop scan interval
    if (this.scanInterval) {
      console.log('🔄 [SMART-SCAN] Clearing scan interval');
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    // Stop connection health monitoring
    if (this.connectionHealthInterval) {
      console.log('💓 [SMART-SCAN] Stopping connection health monitoring');
      clearInterval(this.connectionHealthInterval);
      this.connectionHealthInterval = null;
    }
    
    // Stop keep-alive
    this.stopKeepAlive();
    
    const wasScanning = this.isScanning;
    const deviceCount = this.availableDevices.length;
    
    this.isScanning = false;
    this.availableDevices = [];
    
    console.log(`✅ [SMART-SCAN] Smart scanning stopped - was_scanning=${wasScanning}, cleared_${deviceCount}_devices`);
  }

  // Method to get current available devices
  getAvailableDevices() {
    const deviceCount = this.availableDevices.length;
    const lastScanAge = this.lastScanTime ? Date.now() - this.lastScanTime : 'never';
    console.log(`📱 [FG-SCAN] getAvailableDevices() called - returning ${deviceCount} devices (last_scan=${lastScanAge}ms ago)`);
    
    if (deviceCount > 0) {
      console.log(`📱 [FG-SCAN] Available devices: ${this.availableDevices.map(d => d.displayName).join(', ')}`);
    }
    
    return this.availableDevices;
  }

  // Method to set callback for device discovery
  setDevicesFoundCallback(callback) {
    const callbackType = typeof callback;
    console.log(`📞 [FG-SCAN] setDevicesFoundCallback() called with ${callbackType} callback`);
    
    if (callbackType === 'function') {
      this.onDevicesFound = callback;
      console.log('✅ [FG-SCAN] Device discovery callback registered successfully');
    } else {
      console.warn(`⚠️ [FG-SCAN] Invalid callback type: ${callbackType} (expected function)`);
      this.onDevicesFound = null;
    }
  }

  // Method to manually trigger a scan
  async triggerManualScan() {
    const triggerTime = new Date().toISOString();
    console.log(`🔍 [FG-SCAN] Manual device scan triggered at ${triggerTime}`);
    console.log(`📊 [FG-SCAN] Pre-scan state: scanning=${this.isScanning}, cached_devices=${this.availableDevices.length}, connected=${BluetoothService.isConnected}`);
    
    const startTime = Date.now();
    try {
      await this.performDeviceScan();
      const duration = Date.now() - startTime;
      console.log(`✅ [FG-SCAN] Manual scan completed in ${duration}ms - returning ${this.availableDevices.length} devices`);
      return this.availableDevices;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [FG-SCAN] Manual scan failed after ${duration}ms:`, error);
      throw error;
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

    // Stop smart scanning
    this.stopSmartScanning();

    // Stop keep-alive
    this.stopKeepAlive();

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

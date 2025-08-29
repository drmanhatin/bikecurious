import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { Platform, Alert } from 'react-native';

class NotificationManager {
  constructor() {
    this.notificationId = 'iconsole-foreground-notification';
    this.notificationSetupComplete = false;
    this.lastNotificationUpdate = 0;
    this.notificationThrottleMs = 1000;
    this.notificationCheckInterval = null;
    this.hasLoggedForegroundError = false;
  }

  async initialize() {
    if (this.notificationSetupComplete) return;
    
    try {
      const settings = await notifee.requestPermission();
      
      if (Platform.OS === 'android') {
        await notifee.createChannel({
          id: 'iconsole-foreground',
          name: 'iConsole Tracker',
          importance: AndroidImportance.LOW,
          visibility: AndroidVisibility.PUBLIC,
          description: 'Shows current speed and distance while tracking',
          bypassDnd: false,
          enableVibration: false,
          enableLights: false,
        });

        await this.checkBatteryOptimization();
      } else if (Platform.OS === 'ios') {
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
      }

      this.setupNotificationHandlers();
      this.notificationSetupComplete = true;
      
    } catch (error) {
      // Setup failed
    }
  }

  setupNotificationHandlers() {
    // Handle foreground notification events
    notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === 0 && detail.notification?.id === this.notificationId) {
        setTimeout(async () => {
          try {
            await this.showBasicNotification(0, 0);
          } catch (error) {
            // Recreation failed
          }
        }, 100);
      }
    });

    // Handle background notification events
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      console.log('📱 Background notification event:', type, detail);
      
      // Handle notification dismissal or interaction when app is backgrounded
      if (type === 0 && detail.notification?.id === this.notificationId) {
        console.log('🔄 Foreground notification dismissed in background');
        // Note: Limited functionality available in background context
      }
      
      // Handle any action buttons if you add them later
      if (detail.pressAction?.id) {
        console.log('🎯 Background action pressed:', detail.pressAction.id);
      }
    });
  }

  async checkBatteryOptimization() {
    try {
      const batteryOptimizationEnabled = await notifee.isBatteryOptimizationEnabled();
      
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
                  // Failed to open settings
                }
              },
            },
            {
              text: 'Skip',
              style: 'cancel',
            },
          ],
          { cancelable: false }
        );
      }

      await this.checkPowerManagerSettings();
    } catch (error) {
      // Battery check failed
    }
  }

  async checkPowerManagerSettings() {
    try {
      const powerManagerInfo = await notifee.getPowerManagerInfo();
      
      if (powerManagerInfo.activity) {
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
                    // Failed to open settings
                  }
                },
              },
              {
                text: 'Skip',
                style: 'cancel',
              },
            ],
            { cancelable: false }
          );
        }, 3000);
      }
    } catch (error) {
      // Power manager check failed
    }
  }

  createNotificationConfig(title, body, options = {}) {
    const {
      progress = null,
      style = null,
      connectionStatus = '🔴'
    } = options;

    const notification = {
      id: this.notificationId,
      title: title || `🚴 iConsole Tracker ${connectionStatus}`,
      body: body || 'Speed: 0.0 km/h • Distance: 0.00 km',
    };

    if (Platform.OS === 'android') {
      notification.android = {
        channelId: 'iconsole-foreground',
        asForegroundService: true,
        importance: AndroidImportance.LOW,
        visibility: AndroidVisibility.PUBLIC,
        ongoing: true,
        autoCancel: false,
        onlyAlertOnce: true,
        smallIcon: 'ic_launcher',
        largeIcon: 'ic_launcher',
        silent: true,
        showWhen: false,
        localOnly: true,
        ...(progress && { progress }),
        ...(style && { style }),
      };
    } else if (Platform.OS === 'ios') {
      notification.ios = {
        sound: null,
        badge: 1,
        categoryId: 'iconsole-tracker',
      };
    }

    return notification;
  }

  async showBasicNotification(speed, distance, isConnected = false) {
    try {
      const connectionStatus = isConnected ? '🟢' : '🔴';
      
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
            type: 1,
            text: `Current Speed: ${speed.toFixed(1)} km/h\nTotal Distance: ${distance.toFixed(2)} km\nConnection: ${isConnected ? 'Connected' : 'Disconnected'}`,
          },
          connectionStatus
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      if (!this.hasLoggedForegroundError && error.toString().includes('ForegroundServiceStartNotAllowedException')) {
        this.hasLoggedForegroundError = true;
      } else if (!error.toString().includes('ForegroundServiceStartNotAllowedException')) {
        throw error;
      }
    }
  }

  async updateNotification(speed, distance, isConnected = false) {
    try {
      const now = Date.now();
      const timeSinceLastUpdate = now - this.lastNotificationUpdate;
      if (timeSinceLastUpdate < this.notificationThrottleMs) {
        return;
      }
      this.lastNotificationUpdate = now;

      const connectionStatus = isConnected ? '🟢' : '🔴';
      
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
            type: 1,
            text: `Speed: ${speed.toFixed(1)} km/h\nDistance: ${distance.toFixed(2)} km\nConnection: ${isConnected ? 'Connected' : 'Disconnected'}`,
          },
          connectionStatus
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      if (!this.hasLoggedForegroundError && error.toString().includes('ForegroundServiceStartNotAllowedException')) {
        this.hasLoggedForegroundError = true;
      } else if (!error.toString().includes('ForegroundServiceStartNotAllowedException')) {
        // Update failed
      }
    }
  }

  async showScanningNotification(speed = 0, distance = 0) {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker 🔍`,
        `Scanning for devices... • Speed: ${speed.toFixed(1)} km/h`,
        {
          progress: {
            max: 100,
            current: 0,
            indeterminate: true,
          },
          style: {
            type: 1,
            text: `Status: Scanning for nearby iConsole devices...\nCurrent Speed: ${speed.toFixed(1)} km/h\nTotal Distance: ${distance.toFixed(2)} km`,
          },
          connectionStatus: '🔍'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      // Scanning notification failed
    }
  }

  async showConnectingNotification(deviceName, speed = 0, distance = 0) {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker 🚀`,
        `Connecting to ${deviceName}...`,
        {
          progress: {
            max: 100,
            current: 0,
            indeterminate: true,
          },
          style: {
            type: 1,
            text: `Status: Connecting to iConsole device...\nDevice: ${deviceName}\nSpeed: ${speed.toFixed(1)} km/h`,
          },
          connectionStatus: '🚀'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      // Connecting notification failed
    }
  }

  async showReconnectingNotification(attempts, maxAttempts, speed = 0, distance = 0) {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker 🔄`,
        `Reconnecting... (${attempts}/${maxAttempts})`,
        {
          progress: {
            max: maxAttempts,
            current: attempts,
            indeterminate: true,
          },
          style: {
            type: 1,
            text: `Status: Reconnecting...\nAttempt: ${attempts}/${maxAttempts}\nSpeed: ${speed.toFixed(1)} km/h`,
          },
          connectionStatus: '🔄'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      // Reconnecting notification failed
    }
  }

  async showQuickReconnectNotification(attempts, maxAttempts) {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker ⚡`,
        `Quick reconnecting... (${attempts}/${maxAttempts})`,
        {
          progress: {
            max: maxAttempts,
            current: attempts,
            indeterminate: true,
          },
          style: {
            type: 1,
            text: `Status: Quick reconnection in progress...\nAttempt: ${attempts}/${maxAttempts}\nConnection lost after brief period`,
          },
          connectionStatus: '⚡'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      // Quick reconnect notification failed
    }
  }

  async showConnectionFailedNotification(speed = 0, distance = 0) {
    try {
      const notification = this.createNotificationConfig(
        `🚴 iConsole Tracker 🔴`,
        `Connection Failed • Speed: ${speed.toFixed(1)} km/h`,
        {
          style: {
            type: 1,
            text: `Status: Connection Failed - Manual reconnection required\nLast Speed: ${speed.toFixed(1)} km/h\nTotal Distance: ${distance.toFixed(2)} km`,
          },
          connectionStatus: '🔴'
        }
      );
      
      await notifee.displayNotification(notification);
    } catch (error) {
      // Connection failed notification failed
    }
  }

  startNotificationWatchdog() {
    this.stopNotificationWatchdog();

    this.notificationCheckInterval = setInterval(async () => {
      try {
        const notifications = await notifee.getDisplayedNotifications();
        const ourNotification = notifications.find(n => n.id === this.notificationId);
        
        if (!ourNotification) {
          await this.showBasicNotification(0, 0);
        }
      } catch (error) {
        // Watchdog check failed
      }
    }, 10000);
  }

  stopNotificationWatchdog() {
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
      this.notificationCheckInterval = null;
    }
  }

  async hideNotification() {
    try {
      await notifee.cancelNotification(this.notificationId);
    } catch (error) {
      // Hide notification failed
    }
  }

  async testNotification(speed = 25.5, distance = 12.34) {
    try {
      await this.updateNotification(speed, distance, true);
    } catch (error) {
      // Test notification failed
    }
  }

  async promptBatteryOptimization() {
    if (Platform.OS === 'android') {
      await this.checkBatteryOptimization();
    } else {
      Alert.alert('iOS Device', 'Battery optimization settings are not needed on iOS devices.');
    }
  }
}

export default new NotificationManager();

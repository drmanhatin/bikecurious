import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BluetoothService from './BluetoothService';

const BACKGROUND_FETCH_TASK = 'background-fetch-iconsole';
const MOCK_BACKEND_TASK = 'mock-backend-sync';

class BackgroundService {
  constructor() {
    this.isRegistered = false;
    this.notificationId = null;
    this.lastNotificationUpdate = 0;
    this.notificationUpdateThrottle = 5000; // Only update every 5 seconds
    this.foregroundUpdateInterval = null;
  }

  async registerBackgroundTasks() {
    if (this.isRegistered) {
      console.log('Background tasks already registered');
      return;
    }

    try {
      // Define background fetch task
      TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
        console.log('📱 Background fetch task running...');
        
        try {
          // Get current data
          const speed = BluetoothService.currentSpeed || 0;
          const distance = BluetoothService.totalDistance || 0;
          
          console.log(`📊 Background task data - Speed: ${speed.toFixed(1)} km/h, Distance: ${distance.toFixed(2)} km`);
          
          // Update notification
          await this.updatePersistentNotification(speed, distance);
          
          // Send data to mock backend
          await this.sendDataToBackend(speed, distance);
          
          console.log('✅ Background task completed');
          
          return BackgroundFetch.BackgroundFetchResult.NewData;
        } catch (error) {
          console.error('❌ Background task error:', error);
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });

      // Register background fetch
      const status = await BackgroundFetch.getStatusAsync();
      if (status === BackgroundFetch.BackgroundFetchStatus.Available) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
          minimumInterval: 15, // 15 seconds minimum interval
          stopOnTerminate: false,
          startOnBoot: true,
        });
        
        console.log('Background fetch registered successfully');
        this.isRegistered = true;
      } else {
        console.warn('Background fetch not available:', status);
      }
    } catch (error) {
      console.error('Failed to register background tasks:', error);
    }
  }

  async unregisterBackgroundTasks() {
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
      this.isRegistered = false;
      console.log('Background tasks unregistered');
    } catch (error) {
      console.error('Failed to unregister background tasks:', error);
    }
  }

  async setupNotifications() {
    try {
      // Request permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permission not granted');
        return false;
      }

      // Configure notification behavior
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });

      console.log('Notifications setup completed');
      return true;
    } catch (error) {
      console.error('Failed to setup notifications:', error);
      return false;
    }
  }

  async showPersistentNotification(speed = 0, distance = 0) {
    try {
      // Use a fixed identifier for the persistent notification
      const notificationId = 'iconsole-persistent-notification';
      
      // Cancel any existing notification with this ID
      await Notifications.dismissNotificationAsync(notificationId);
      
      const notification = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚴 iConsole Tracker',
          body: `Speed: ${speed.toFixed(1)} km/h • Distance: ${distance.toFixed(2)} km`,
          data: { persistent: true },
          sticky: true,
        },
        trigger: null, // Show immediately
        identifier: notificationId,
      });

      this.notificationId = notificationId;
      console.log('Persistent notification shown with ID:', notificationId);
      return notification;
    } catch (error) {
      console.error('Failed to show persistent notification:', error);
      return null;
    }
  }

  async updatePersistentNotification(speed = 0, distance = 0) {
    try {
      // Throttle notification updates to prevent spam
      const now = Date.now();
      if (now - this.lastNotificationUpdate < this.notificationUpdateThrottle) {
        console.log('Skipping notification update (throttled)');
        return; // Skip update if too soon
      }
      
      this.lastNotificationUpdate = now;
      console.log(`Updating notification: ${speed.toFixed(1)} km/h, ${distance.toFixed(2)} km`);
      
      // Simply call showPersistentNotification - it will replace the existing one
      await this.showPersistentNotification(speed, distance);
    } catch (error) {
      console.error('Failed to update persistent notification:', error);
    }
  }

  async hidePersistentNotification() {
    try {
      if (this.notificationId) {
        await Notifications.dismissNotificationAsync(this.notificationId);
        this.notificationId = null;
        console.log('Persistent notification hidden');
      }
    } catch (error) {
      console.error('Failed to hide persistent notification:', error);
    }
  }

  async sendDataToBackend(speed, distance) {
    try {
      // Mock backend endpoint
      const mockEndpoint = 'https://jsonplaceholder.typicode.com/posts';
      
      const data = {
        timestamp: new Date().toISOString(),
        speed_kmh: speed,
        total_distance_km: distance,
        device_id: 'iconsole-tracker',
      };

      const response = await fetch(mockEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Data sent to backend successfully:', result.id);
        
        // Store last sync time
        await AsyncStorage.setItem('lastBackendSync', new Date().toISOString());
      } else {
        console.error('Backend sync failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to send data to backend:', error);
    }
  }

  async getLastSyncTime() {
    try {
      const lastSync = await AsyncStorage.getItem('lastBackendSync');
      return lastSync ? new Date(lastSync) : null;
    } catch (error) {
      console.error('Failed to get last sync time:', error);
      return null;
    }
  }

  async startBackgroundServices() {
    console.log('Starting background services...');
    
    // Setup notifications
    await this.setupNotifications();
    
    // Register background tasks
    await this.registerBackgroundTasks();
    
    // Show initial persistent notification
    const speed = BluetoothService.currentSpeed || 0;
    const distance = BluetoothService.totalDistance || 0;
    await this.showPersistentNotification(speed, distance);
    
    // Start foreground notification updates (less frequent)
    this.startForegroundUpdates();
    
    console.log('Background services started');
  }

  startForegroundUpdates() {
    // Clear any existing interval
    if (this.foregroundUpdateInterval) {
      clearInterval(this.foregroundUpdateInterval);
    }
    
    // Update notification every 5 seconds when app is in foreground for testing
    this.foregroundUpdateInterval = setInterval(async () => {
      try {
        console.log('🔄 Foreground notification update triggered');
        const speed = BluetoothService.currentSpeed || 0;
        const distance = BluetoothService.totalDistance || 0;
        console.log(`📊 Current data: Speed=${speed.toFixed(1)}, Distance=${distance.toFixed(2)}`);
        await this.updatePersistentNotification(speed, distance);
      } catch (error) {
        console.error('❌ Foreground notification update error:', error);
      }
    }, 5000); // Every 5 seconds for testing
    
    console.log('✅ Started foreground notification updates (every 5s)');
  }

  async stopBackgroundServices() {
    console.log('Stopping background services...');
    
    // Stop foreground updates
    if (this.foregroundUpdateInterval) {
      clearInterval(this.foregroundUpdateInterval);
      this.foregroundUpdateInterval = null;
    }
    
    // Unregister background tasks
    await this.unregisterBackgroundTasks();
    
    // Hide persistent notification
    await this.hidePersistentNotification();
    
    console.log('Background services stopped');
  }
}

export default new BackgroundService();

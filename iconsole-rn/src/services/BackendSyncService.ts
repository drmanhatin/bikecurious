import AsyncStorage from '@react-native-async-storage/async-storage';

interface WorkoutDataPoint {
  timestamp: number;
  speed: number; // km/h
  distance: number; // km
  sessionId: string;
}

interface QueuedDataPoint extends WorkoutDataPoint {
  id: string;
  retryCount: number;
}

class BackendSyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private currentSessionId: string | null = null;
  private isOnline = true;
  
  // Replace with your actual backend URL
  private readonly BACKEND_URL = 'https://your-backend.com/api';
  
  public startWorkoutSync(sessionId: string): void {
    console.log('🔄 Starting backend sync for session:', sessionId);
    this.currentSessionId = sessionId;
    
    // Start syncing every 5 seconds
    this.syncInterval = setInterval(() => {
      this.processSyncQueue();
    }, 5000);
  }

  public stopWorkoutSync(): void {
    console.log('🔄 Stopping backend sync');
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    // Final sync attempt
    this.processSyncQueue();
    this.currentSessionId = null;
  }

  public async queueDataPoint(speed: number, distance: number): Promise<void> {
    if (!this.currentSessionId) return;

    const dataPoint: QueuedDataPoint = {
      id: `${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      speed,
      distance,
      sessionId: this.currentSessionId,
      retryCount: 0,
    };

    try {
      const queue = await this.getQueue();
      queue.push(dataPoint);
      await AsyncStorage.setItem('sync_queue', JSON.stringify(queue));
      
      console.log('📊 [DATA] Queued data point:', { 
        speed: speed.toFixed(1) + ' km/h', 
        distance: distance.toFixed(2) + ' km',
        queueSize: queue.length 
      });
    } catch (error) {
      console.error('Failed to queue data point:', error);
    }
  }

  private async getQueue(): Promise<QueuedDataPoint[]> {
    try {
      const queueJson = await AsyncStorage.getItem('sync_queue');
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      console.error('Failed to load sync queue:', error);
      return [];
    }
  }

  private async saveQueue(queue: QueuedDataPoint[]): Promise<void> {
    try {
      await AsyncStorage.setItem('sync_queue', JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  private async processSyncQueue(): Promise<void> {
    const queue = await this.getQueue();
    if (queue.length === 0) {
      console.log('🔄 [BACKGROUND] Sync queue empty - no data to process');
      return;
    }

    console.log(`🔄 [BACKGROUND] Processing ${queue.length} queued data points...`);

    const successfulIds: string[] = [];
    const failedItems: QueuedDataPoint[] = [];

    for (const item of queue) {
      try {
        const success = await this.sendToBackend(item);
        if (success) {
          successfulIds.push(item.id);
          console.log('✅ Synced data point:', item.id);
        } else {
          item.retryCount++;
          if (item.retryCount < 3) {
            failedItems.push(item);
          } else {
            console.warn('❌ Dropping data point after 3 retries:', item.id);
          }
        }
      } catch (error) {
        console.error('Sync error for item:', item.id, error);
        item.retryCount++;
        if (item.retryCount < 3) {
          failedItems.push(item);
        }
      }
    }

    // Update queue with only failed items
    await this.saveQueue(failedItems);
    
    if (successfulIds.length > 0) {
      console.log(`✅ [BACKGROUND] Successfully synced ${successfulIds.length} data points`);
    }
    if (failedItems.length > 0) {
      console.log(`⏳ [BACKGROUND] ${failedItems.length} data points queued for retry`);
    }
    
    console.log(`📊 [BACKGROUND] Sync summary: ${successfulIds.length} sent, ${failedItems.length} pending`);
  }

  private async sendToBackend(dataPoint: WorkoutDataPoint): Promise<boolean> {
    try {
      // Replace this with your actual backend endpoint
      const response = await fetch(`${this.BACKEND_URL}/workout-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add your auth headers here
          // 'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: dataPoint.sessionId,
          timestamp: dataPoint.timestamp,
          speed: dataPoint.speed,
          distance: dataPoint.distance,
          deviceType: 'iconsole',
        }),
      });

      if (response.ok) {
        return true;
      } else {
        console.error('Backend response error:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error('Network error sending to backend:', error);
      return false;
    }
  }

  // For testing - mock backend that always succeeds
  public enableMockMode(): void {
    console.log('🧪 Mock mode enabled - simulating successful backend sync');
    this.sendToBackend = async (dataPoint: WorkoutDataPoint): Promise<boolean> => {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('🧪 Mock backend received:', {
        session: dataPoint.sessionId,
        speed: dataPoint.speed.toFixed(1) + ' km/h',
        distance: dataPoint.distance.toFixed(2) + ' km',
      });
      return true;
    };
  }

  public async getQueueStatus(): Promise<{ pending: number; total: number }> {
    const queue = await this.getQueue();
    return {
      pending: queue.length,
      total: queue.length,
    };
  }

  // Public method to manually trigger sync (for testing)
  public async manualSync(): Promise<void> {
    console.log('🔄 [MANUAL] Manual sync triggered');
    return this.processSyncQueue();
  }
}

export default new BackendSyncService();

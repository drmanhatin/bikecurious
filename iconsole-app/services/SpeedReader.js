import BluetoothService from './BluetoothService';

class SpeedReader {
  constructor() {
    this.currentSpeed = 0;
    this.totalDistance = 0;
    this.speedDatapoints = [];
    this.onSpeedUpdate = null;
    this.onDistanceUpdate = null;
    this.isReading = false;
    this.updateInterval = null;
  }

  startReading() {
    if (this.isReading) return;
    
    this.isReading = true;
    this.setupBluetoothCallbacks();
    this.startPeriodicUpdates();
  }

  stopReading() {
    if (!this.isReading) return;
    
    this.isReading = false;
    this.clearPeriodicUpdates();
    this.clearBluetoothCallbacks();
  }

  setupBluetoothCallbacks() {
    const originalSpeedCallback = BluetoothService.onSpeedUpdate;
    const originalDistanceCallback = BluetoothService.onDistanceUpdate;
    
    BluetoothService.onSpeedUpdate = (speed) => {
      this.speedDatapoints.push({
        speed,
        timestamp: Date.now()
      });
      
      // Keep only last 100 datapoints
      if (this.speedDatapoints.length > 100) {
        this.speedDatapoints = this.speedDatapoints.slice(-100);
      }
      
      // Calculate current speed as average of last 3 entries
      this.currentSpeed = this.calculateAverageOfLastThree();
      
      if (originalSpeedCallback) {
        originalSpeedCallback(this.currentSpeed);
      }
      
      if (this.onSpeedUpdate) {
        this.onSpeedUpdate(this.currentSpeed);
      }
    };
    
    BluetoothService.onDistanceUpdate = (distance) => {
      this.totalDistance = distance;
      
      if (originalDistanceCallback) {
        originalDistanceCallback(distance);
      }
      
      if (this.onDistanceUpdate) {
        this.onDistanceUpdate(distance);
      }
    };
  }

  clearBluetoothCallbacks() {
    BluetoothService.onSpeedUpdate = null;
    BluetoothService.onDistanceUpdate = null;
  }

  startPeriodicUpdates() {
    this.clearPeriodicUpdates();
    
    this.updateInterval = setInterval(() => {
      if (BluetoothService.isConnected) {
        // Update current speed using average of last 3 entries
        this.currentSpeed = this.calculateAverageOfLastThree();
        this.totalDistance = BluetoothService.totalDistance || 0;
        
        if (this.onSpeedUpdate) {
          this.onSpeedUpdate(this.currentSpeed);
        }
        
        if (this.onDistanceUpdate) {
          this.onDistanceUpdate(this.totalDistance);
        }
      }
    }, 1000);
  }

  clearPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  calculateAverageOfLastThree() {
    if (this.speedDatapoints.length === 0) return 0;
    
    // Get the last 3 entries (or fewer if we don't have 3 yet)
    const lastThree = this.speedDatapoints.slice(-3);
    const sum = lastThree.reduce((acc, point) => acc + point.speed, 0);
    return sum / lastThree.length;
  }

  getCurrentSpeed() {
    return this.currentSpeed;
  }

  getTotalDistance() {
    return this.totalDistance;
  }

  getSpeedDatapoints() {
    return [...this.speedDatapoints];
  }

  getAverageSpeed() {
    if (this.speedDatapoints.length === 0) return 0;
    
    const sum = this.speedDatapoints.reduce((acc, point) => acc + point.speed, 0);
    return sum / this.speedDatapoints.length;
  }

  getMaxSpeed() {
    if (this.speedDatapoints.length === 0) return 0;
    
    return Math.max(...this.speedDatapoints.map(point => point.speed));
  }

  setSpeedUpdateCallback(callback) {
    this.onSpeedUpdate = callback;
  }

  setDistanceUpdateCallback(callback) {
    this.onDistanceUpdate = callback;
  }

  reset() {
    this.currentSpeed = 0;
    this.totalDistance = 0;
    this.speedDatapoints = [];
  }
}

export default new SpeedReader();

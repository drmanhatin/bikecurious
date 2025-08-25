// iConsole Fitness Tracker Content Script
// Handles Bluetooth connection and data collection

class iConsoleTracker {
    constructor() {
        this.device = null;
        this.server = null;
        this.isConnected = false;
        this.currentSpeed = 0.0;
        this.totalDistance = 0.0;
        this.speedDatapoints = [];
        this.lastDataTime = Date.now();
        this.updateInterval = null;
        
        // Wheel tracking for speed calculation
        this.lastWheelRevs = null;
        this.lastWheelTime = null;
        
        // BLE characteristics UUIDs (same as Python version)
        this.INDOOR_BIKE_DATA = "00002ad2-0000-1000-8000-00805f9b34fb";
        this.CSC_MEASUREMENT = "00002a5b-0000-1000-8000-00805f9b34fb";
        this.CYCLING_POWER_MEASUREMENT = "00002a63-0000-1000-8000-00805f9b34fb";
        
        // YouTube integration
        this.isYouTube = this.detectYouTube();
        this.youtubePlayer = null;
        this.lastSpeedForVideo = 0.0;
        this.videoPausedByTracker = false;
        this.youtubeSettings = { enabled: true, pauseDelay: 3 }; // 3 seconds delay before pausing
        
        // Load saved distance and settings
        this.loadTotalDistance();
        this.loadYouTubeSettings();
        
        // Initialize YouTube integration if on YouTube
        if (this.isYouTube) {
            this.initializeYouTubeIntegration();
        }
        
        // Start the update worker
        this.startUpdateWorker();
        
        console.log(`🚴 iConsole Tracker initialized${this.isYouTube ? ' with YouTube integration' : ''}`);
    }
    
    async loadTotalDistance() {
        try {
            const result = await chrome.storage.local.get(['totalDistance']);
            this.totalDistance = result.totalDistance || 0.0;
            console.log(`📊 Loaded total distance: ${this.totalDistance.toFixed(3)} km`);
        } catch (error) {
            console.error("Error loading distance:", error);
            this.totalDistance = 0.0;
        }
    }
    
    async saveTotalDistance() {
        try {
            await chrome.storage.local.set({
                totalDistance: this.totalDistance,
                lastUpdated: new Date().toISOString()
            });
        } catch (error) {
            console.error("Error saving distance:", error);
        }
    }
    
    detectYouTube() {
        const hostname = window.location.hostname;
        return hostname === 'www.youtube.com' || 
               hostname === 'youtube.com' || 
               hostname === 'm.youtube.com' || 
               hostname === 'music.youtube.com' ||
               hostname.endsWith('.youtube.com');
    }
    
    async loadYouTubeSettings() {
        try {
            const result = await chrome.storage.local.get(['youtubeSettings']);
            if (result.youtubeSettings) {
                this.youtubeSettings = { ...this.youtubeSettings, ...result.youtubeSettings };
            }
            console.log(`📺 YouTube settings loaded:`, this.youtubeSettings);
        } catch (error) {
            console.error("Error loading YouTube settings:", error);
        }
    }
    
    async saveYouTubeSettings() {
        try {
            await chrome.storage.local.set({
                youtubeSettings: this.youtubeSettings
            });
        } catch (error) {
            console.error("Error saving YouTube settings:", error);
        }
    }
    
    initializeYouTubeIntegration() {
        console.log("📺 Initializing YouTube integration...");
        console.log(`📺 Current URL: ${window.location.href}`);
        console.log(`📺 Settings:`, this.youtubeSettings);
        
        // Wait for YouTube player to load
        this.waitForYouTubePlayer();
        
        // Listen for navigation changes on YouTube (SPA)
        this.observeYouTubeNavigation();
        
        // Add debugging method to window for manual testing
        window.iConsoleDebug = {
            getTracker: () => this,
            testVideoControl: (speed) => {
                console.log(`🧪 Testing video control with speed: ${speed} km/h`);
                this.currentSpeed = speed;
                this.handleVideoControl(speed);
            },
            findPlayer: () => {
                const video = document.querySelector('video');
                console.log('🧪 Found video element:', video);
                console.log('🧪 Video properties:', {
                    paused: video?.paused,
                    duration: video?.duration,
                    currentTime: video?.currentTime,
                    readyState: video?.readyState
                });
                return video;
            },
            getStatus: () => ({
                isYouTube: this.isYouTube,
                hasPlayer: !!this.youtubePlayer,
                playerInDOM: this.youtubePlayer ? document.contains(this.youtubePlayer) : false,
                settings: this.youtubeSettings,
                currentSpeed: this.currentSpeed,
                lastSpeedForVideo: this.lastSpeedForVideo,
                videoPausedByTracker: this.videoPausedByTracker
            })
        };
        
        console.log("📺 YouTube integration initialized. Use window.iConsoleDebug for testing.");
    }
    
    waitForYouTubePlayer() {
        const checkForPlayer = () => {
            const video = document.querySelector('video');
            if (video && video.duration) { // Ensure video is actually loaded
                // Remove previous event listeners if player changed
                if (this.youtubePlayer && this.youtubePlayer !== video) {
                    console.log("📺 YouTube player changed, updating reference");
                }
                
                this.youtubePlayer = video;
                console.log("📺 YouTube player found and connected");
                
                // Remove existing listeners to avoid duplicates
                video.removeEventListener('play', this.handleVideoPlay);
                video.removeEventListener('pause', this.handleVideoPause);
                
                // Bind event handlers to maintain 'this' context
                this.handleVideoPlay = () => {
                    console.log("▶️ YouTube video started playing");
                    this.videoPausedByTracker = false;
                };
                
                this.handleVideoPause = () => {
                    if (!this.videoPausedByTracker) {
                        console.log("⏸️ YouTube video paused by user");
                    }
                };
                
                // Listen for video events
                video.addEventListener('play', this.handleVideoPlay);
                video.addEventListener('pause', this.handleVideoPause);
                
                return true;
            }
            return false;
        };
        
        // Try immediately
        if (!checkForPlayer()) {
            // If not found, keep checking every 500ms for up to 30 seconds
            let attempts = 0;
            const maxAttempts = 60; // Increased for slower loading pages
            
            const interval = setInterval(() => {
                attempts++;
                if (checkForPlayer() || attempts >= maxAttempts) {
                    clearInterval(interval);
                    if (attempts >= maxAttempts) {
                        console.log("📺 YouTube player not found after 30 seconds");
                    }
                }
            }, 500);
        }
    }
    
    observeYouTubeNavigation() {
        // YouTube is a SPA, so we need to watch for navigation changes
        let lastUrl = location.href;
        
        const observer = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                console.log("📺 YouTube navigation detected, re-initializing player");
                // Reset player reference
                this.youtubePlayer = null;
                this.videoPausedByTracker = false;
                setTimeout(() => this.waitForYouTubePlayer(), 1000);
            }
        });
        
        // Watch for changes in the document
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } else {
            // If body isn't ready yet, wait for it
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            });
        }
        
        // Also listen for popstate events (back/forward navigation)
        window.addEventListener('popstate', () => {
            console.log("📺 YouTube popstate navigation detected");
            this.youtubePlayer = null;
            this.videoPausedByTracker = false;
            setTimeout(() => this.waitForYouTubePlayer(), 1000);
        });
    }
    
    handleVideoControl(currentSpeed) {
        if (!this.isYouTube) {
            return;
        }
        
        if (!this.youtubeSettings.enabled) {
            console.log("📺 YouTube integration disabled in settings");
            return;
        }
        
        if (!this.youtubePlayer) {
            console.log("📺 No YouTube player found for video control");
            return;
        }
        
        // Check if player is still valid (not removed from DOM)
        if (!document.contains(this.youtubePlayer)) {
            console.log("📺 YouTube player no longer in DOM, re-initializing");
            this.youtubePlayer = null;
            this.waitForYouTubePlayer();
            return;
        }
        
        const isCurrentlyBiking = currentSpeed > 0.1; // Consider 0.1 km/h as minimum biking speed
        const wasRecentlyBiking = this.lastSpeedForVideo > 0.1;
        
        // Debug logging
        if (isCurrentlyBiking !== wasRecentlyBiking) {
            console.log(`📺 Biking state changed: ${wasRecentlyBiking ? 'biking' : 'stopped'} -> ${isCurrentlyBiking ? 'biking' : 'stopped'} (${currentSpeed.toFixed(1)} km/h)`);
        }
        
        // If user stopped biking and video is playing
        if (!isCurrentlyBiking && wasRecentlyBiking && !this.youtubePlayer.paused) {
            console.log(`⏸️ User stopped biking (${currentSpeed.toFixed(1)} km/h), pausing YouTube video in ${this.youtubeSettings.pauseDelay}s`);
            
            // Pause after delay
            setTimeout(() => {
                if (this.youtubePlayer && !this.youtubePlayer.paused && this.currentSpeed <= 0.1) {
                    try {
                        this.youtubePlayer.pause();
                        this.videoPausedByTracker = true;
                        console.log("⏸️ YouTube video paused - user not biking");
                        
                        // Show notification
                        this.showYouTubeNotification("Video paused - start biking to resume!");
                    } catch (error) {
                        console.error("❌ Error pausing YouTube video:", error);
                    }
                }
            }, this.youtubeSettings.pauseDelay * 1000);
        }
        
        // If user started biking and video was paused by tracker
        if (isCurrentlyBiking && !wasRecentlyBiking && this.videoPausedByTracker && this.youtubePlayer.paused) {
            console.log(`▶️ User started biking (${currentSpeed.toFixed(1)} km/h), resuming YouTube video`);
            try {
                this.youtubePlayer.play().then(() => {
                    this.videoPausedByTracker = false;
                    console.log("▶️ YouTube video resumed successfully");
                    
                    // Show notification
                    this.showYouTubeNotification("Video resumed - keep biking!");
                }).catch(error => {
                    console.error("❌ Error resuming YouTube video:", error);
                    // Reset state if play failed
                    this.videoPausedByTracker = false;
                });
            } catch (error) {
                console.error("❌ Error calling play on YouTube video:", error);
                this.videoPausedByTracker = false;
            }
        }
        
        this.lastSpeedForVideo = currentSpeed;
    }
    
    showYouTubeNotification(message) {
        // Create a temporary notification overlay
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        // Add animation keyframes
        if (!document.getElementById('iconsole-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'iconsole-notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        notification.textContent = `🚴 ${message}`;
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    async requestBluetoothConnection() {
        if (!navigator.bluetooth) {
            console.error("❌ Web Bluetooth API not supported");
            alert("Web Bluetooth API is not supported in this browser. Please use Chrome or Edge.");
            return false;
        }
        
        try {
            console.log("🔍 Requesting Bluetooth device...");
            
            // Request device with fitness machine service
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['fitness_machine'] },
                    { services: [0x1826] }, // Fitness Machine Service UUID
                    { namePrefix: 'iConsole' },
                    { namePrefix: 'Bike' }
                ],
                optionalServices: [
                    'fitness_machine',
                    'cycling_speed_and_cadence',
                    'cycling_power',
                    this.INDOOR_BIKE_DATA,
                    this.CSC_MEASUREMENT,
                    this.CYCLING_POWER_MEASUREMENT
                ]
            });
            
            console.log(`✅ Selected device: ${this.device.name}`);
            
            // Add disconnect listener
            this.device.addEventListener('gattserverdisconnected', () => {
                console.log("📱 Device disconnected");
                this.isConnected = false;
                this.updateConnectionStatus();
            });
            
            return await this.connect();
            
        } catch (error) {
            console.error("❌ Bluetooth request failed:", error);
            if (error.name === 'NotFoundError') {
                alert("No compatible device found. Make sure your iConsole bike is in pairing mode.");
            } else {
                alert(`Bluetooth connection failed: ${error.message}`);
            }
            return false;
        }
    }
    
    async connect() {
        if (!this.device) {
            console.error("❌ No device selected");
            return false;
        }
        
        try {
            console.log("🔗 Connecting to GATT server...");
            this.server = await this.device.gatt.connect();
            this.isConnected = true;
            
            console.log("✅ Connected successfully!");
            this.updateConnectionStatus();
            
            // Start data collection
            await this.startDataCollection();
            
            return true;
            
        } catch (error) {
            console.error("❌ Connection failed:", error);
            this.isConnected = false;
            this.updateConnectionStatus();
            return false;
        }
    }
    
    async startDataCollection() {
        if (!this.server) {
            console.error("❌ Not connected to server");
            return;
        }
        
        console.log("📡 Starting data collection...");
        
        // Try to subscribe to different characteristics
        const characteristics = [
            { uuid: this.INDOOR_BIKE_DATA, name: "Indoor Bike Data" },
            { uuid: this.CSC_MEASUREMENT, name: "Speed & Cadence" },
            { uuid: this.CYCLING_POWER_MEASUREMENT, name: "Power Measurement" }
        ];
        
        let subscribedCount = 0;
        
        for (const char of characteristics) {
            try {
                const service = await this.server.getPrimaryService('fitness_machine').catch(() => null) ||
                               await this.server.getPrimaryService('cycling_speed_and_cadence').catch(() => null) ||
                               await this.server.getPrimaryService('cycling_power').catch(() => null);
                
                if (service) {
                    const characteristic = await service.getCharacteristic(char.uuid);
                    await characteristic.startNotifications();
                    
                    characteristic.addEventListener('characteristicvaluechanged', (event) => {
                        this.handleBikeData(event.target.value, char.name);
                    });
                    
                    console.log(`✅ Subscribed to ${char.name}`);
                    subscribedCount++;
                }
            } catch (error) {
                console.log(`⚠️ Could not subscribe to ${char.name}:`, error.message);
            }
        }
        
        if (subscribedCount === 0) {
            console.log("🔍 No standard characteristics found, discovering all services...");
            await this.discoverAllCharacteristics();
        } else {
            console.log(`✅ Successfully subscribed to ${subscribedCount} characteristics`);
        }
    }
    
    async discoverAllCharacteristics() {
        try {
            const services = await this.server.getPrimaryServices();
            
            for (const service of services) {
                console.log(`🔍 Service: ${service.uuid}`);
                
                try {
                    const characteristics = await service.getCharacteristics();
                    
                    for (const char of characteristics) {
                        console.log(`  📋 Characteristic: ${char.uuid}`);
                        
                        if (char.properties.notify || char.properties.indicate) {
                            try {
                                await char.startNotifications();
                                char.addEventListener('characteristicvaluechanged', (event) => {
                                    this.handleBikeData(event.target.value, `Custom-${char.uuid.substring(0, 8)}`);
                                });
                                console.log(`  ✅ Subscribed to ${char.uuid}`);
                            } catch (error) {
                                console.log(`  ⚠️ Could not subscribe to ${char.uuid}:`, error.message);
                            }
                        }
                    }
                } catch (error) {
                    console.log(`  ❌ Could not get characteristics for service ${service.uuid}:`, error.message);
                }
            }
        } catch (error) {
            console.error("❌ Error discovering characteristics:", error);
        }
    }
    
    handleBikeData(dataValue, charName) {
        const data = new Uint8Array(dataValue.buffer);
        console.log(`📊 Received data from ${charName}:`, Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        const speed = this.extractSpeed(data, charName);
        if (speed !== null) {
            this.addSpeedDatapoint(speed);
            console.log(`🚴 Speed: ${speed.toFixed(1)} km/h`);
        }
    }
    
    extractSpeed(data, charName) {
        try {
            if (charName.includes("Indoor Bike") && data.length >= 4) {
                // Indoor Bike Data format
                const flags = data[0] | (data[1] << 8);
                if (flags & 0x01) { // Speed present
                    const speed = (data[2] | (data[3] << 8)) / 100.0; // km/h
                    return speed;
                }
            }
            
            else if (charName.includes("Speed") && data.length >= 7) {
                // Cycling Speed and Cadence format
                const flags = data[0];
                if (flags & 0x01) { // Wheel data present
                    const wheelRevs = data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
                    const wheelTime = data[5] | (data[6] << 8);
                    
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
                            
                            this.lastWheelRevs = wheelRevs;
                            this.lastWheelTime = wheelTime;
                            
                            return speedKmh;
                        }
                    }
                    
                    this.lastWheelRevs = wheelRevs;
                    this.lastWheelTime = wheelTime;
                }
            }
        } catch (error) {
            console.log(`⚠️ Error extracting speed from ${charName}:`, error);
        }
        
        return null;
    }
    
    addSpeedDatapoint(speed) {
        this.speedDatapoints.push(speed);
        this.lastDataTime = Date.now();
    }
    
    startUpdateWorker() {
        // Update every second
        this.updateInterval = setInterval(() => {
            this.updateData();
        }, 1000);
        
        console.log("⏰ Update worker started");
    }
    
    updateData() {
        const currentTime = Date.now();
        
        if (this.speedDatapoints.length > 0) {
            // Average speed from recent datapoints
            const oldSpeed = this.currentSpeed;
            this.currentSpeed = this.speedDatapoints.reduce((sum, speed) => sum + speed, 0) / this.speedDatapoints.length;
            this.speedDatapoints = []; // Clear after averaging
            
            console.log(`📈 Speed updated: ${oldSpeed.toFixed(1)} -> ${this.currentSpeed.toFixed(1)} km/h`);
        } else {
            // No recent data - decay speed by 33% per second
            const timeSinceData = (currentTime - this.lastDataTime) / 1000;
            if (timeSinceData > 1.0) {
                const oldSpeed = this.currentSpeed;
                const decayFactor = Math.pow(0.67, Math.floor(timeSinceData));
                this.currentSpeed *= decayFactor;
                
                if (this.currentSpeed < 0.1) {
                    this.currentSpeed = 0.0;
                }
                
                if (oldSpeed !== this.currentSpeed) {
                    console.log(`📉 Speed decay: ${oldSpeed.toFixed(1)} -> ${this.currentSpeed.toFixed(1)} km/h (no data for ${timeSinceData.toFixed(1)}s)`);
                }
            }
        }
        
        // Add distance based on current speed
        if (this.currentSpeed > 0) {
            const distanceIncrement = this.currentSpeed / 3600.0; // km per second
            this.totalDistance += distanceIncrement;
            this.saveTotalDistance();
        }
        
        // Handle YouTube video control
        this.handleVideoControl(this.currentSpeed);
        
        // Log current status
        console.log(`🚴 Current: ${this.currentSpeed.toFixed(1)} km/h • ${this.totalDistance.toFixed(3)} km total`);
        
        // Update extension badge
        this.updateBadge();
    }
    
    updateBadge() {
        if (chrome.action) {
            const badgeText = this.currentSpeed > 0 ? `${this.currentSpeed.toFixed(0)}` : '';
            chrome.action.setBadgeText({ text: badgeText });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        }
    }
    
    updateConnectionStatus() {
        // Send status to popup if it's open
        chrome.runtime.sendMessage({
            type: 'status_update',
            connected: this.isConnected,
            speed: this.currentSpeed,
            distance: this.totalDistance
        }).catch(() => {
            // Popup might not be open, ignore error
        });
    }
    
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
        this.updateConnectionStatus();
        console.log("📱 Disconnected from device");
    }
    
    stopUpdateWorker() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        console.log("⏰ Update worker stopped");
    }
}

// Initialize the tracker
let tracker = null;

// Initialize tracker immediately if on YouTube (for integration features)
function initializeTracker() {
    if (!tracker) {
        tracker = new iConsoleTracker();
        console.log('🚴 Tracker initialized for page integration');
    }
    return tracker;
}

// Auto-initialize on YouTube for integration features
if (window.location.hostname.includes('youtube.com')) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTracker);
    } else {
        initializeTracker();
    }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'connect') {
        if (!tracker) {
            tracker = new iConsoleTracker();
        }
        tracker.requestBluetoothConnection().then(success => {
            sendResponse({ success });
        });
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'disconnect') {
        if (tracker) {
            tracker.disconnect();
        }
        sendResponse({ success: true });
    }
    
    if (request.action === 'get_status') {
        const status = tracker ? {
            connected: tracker.isConnected,
            speed: tracker.currentSpeed,
            distance: tracker.totalDistance,
            isYouTube: tracker.isYouTube,
            youtubeSettings: tracker.youtubeSettings
        } : {
            connected: false,
            speed: 0,
            distance: 0,
            isYouTube: false,
            youtubeSettings: { enabled: true, pauseDelay: 3 }
        };
        sendResponse(status);
    }
    
    if (request.action === 'update_youtube_settings') {
        if (tracker) {
            tracker.youtubeSettings = { ...tracker.youtubeSettings, ...request.settings };
            tracker.saveYouTubeSettings();
            sendResponse({ success: true, settings: tracker.youtubeSettings });
        } else {
            sendResponse({ success: false, error: 'Tracker not initialized' });
        }
    }
});

// Auto-connect on page load if we have a saved device
window.addEventListener('load', () => {
    // Only initialize on user interaction to avoid permission issues
    console.log("🚴 iConsole Fitness Tracker content script loaded");
});

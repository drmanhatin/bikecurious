// Popup script for iConsole Fitness Tracker

class PopupController {
    constructor() {
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.currentSpeed = document.getElementById('currentSpeed');
        this.totalDistance = document.getElementById('totalDistance');
        
        // YouTube elements
        this.youtubeSection = document.getElementById('youtubeSection');
        this.youtubeEnabled = document.getElementById('youtubeEnabled');
        this.pauseDelay = document.getElementById('pauseDelay');
        this.youtubeInfo = document.getElementById('youtubeInfo');
        
        this.isConnected = false;
        this.isYouTube = false;
        
        this.initializeEventListeners();
        this.updateStatus();
        
        // Start periodic updates
        this.startPeriodicUpdates();
    }
    
    initializeEventListeners() {
        this.connectBtn.addEventListener('click', () => {
            this.connectToBike();
        });
        
        this.disconnectBtn.addEventListener('click', () => {
            this.disconnectFromBike();
        });
        
        // YouTube settings listeners
        this.youtubeEnabled.addEventListener('change', () => {
            this.updateYouTubeSettings();
        });
        
        this.pauseDelay.addEventListener('change', () => {
            this.updateYouTubeSettings();
        });
        
        // Listen for status updates from content script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'status_update') {
                this.updateDisplayData(message);
            }
        });
    }
    
    async connectToBike() {
        try {
            this.setConnecting(true);
            
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send connect message to content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'connect' });
            
            if (response && response.success) {
                console.log("✅ Successfully connected to bike");
                this.setConnected(true);
            } else {
                console.error("❌ Failed to connect to bike");
                this.setConnected(false);
                this.showError("Failed to connect to bike. Please try again.");
            }
        } catch (error) {
            console.error("❌ Connection error:", error);
            this.setConnected(false);
            this.showError("Connection error. Make sure you're on a webpage and try again.");
        } finally {
            this.setConnecting(false);
        }
    }
    
    async disconnectFromBike() {
        try {
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send disconnect message to content script
            await chrome.tabs.sendMessage(tab.id, { action: 'disconnect' });
            
            this.setConnected(false);
            console.log("📱 Disconnected from bike");
        } catch (error) {
            console.error("❌ Disconnect error:", error);
        }
    }
    
    async updateStatus() {
        try {
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Get status from content script
            const status = await chrome.tabs.sendMessage(tab.id, { action: 'get_status' });
            
            if (status) {
                this.setConnected(status.connected);
                this.updateDisplayData(status);
                this.updateYouTubeDisplay(status);
            }
        } catch (error) {
            // Content script might not be loaded yet
            console.log("Content script not ready yet");
        }
    }
    
    setConnecting(connecting) {
        if (connecting) {
            this.connectBtn.textContent = 'Connecting...';
            this.connectBtn.disabled = true;
            this.statusText.textContent = 'Connecting...';
            this.statusIndicator.className = 'status-indicator connecting';
        } else {
            this.connectBtn.disabled = false;
            if (!this.isConnected) {
                this.connectBtn.textContent = 'Connect to Bike';
            }
        }
    }
    
    setConnected(connected) {
        this.isConnected = connected;
        
        if (connected) {
            this.connectBtn.style.display = 'none';
            this.disconnectBtn.style.display = 'block';
            this.statusText.textContent = 'Connected';
            this.statusIndicator.className = 'status-indicator connected';
        } else {
            this.connectBtn.style.display = 'block';
            this.disconnectBtn.style.display = 'none';
            this.statusText.textContent = 'Disconnected';
            this.statusIndicator.className = 'status-indicator disconnected';
            
            // Reset display values
            this.currentSpeed.textContent = '-- km/h';
            this.totalDistance.textContent = '-- km';
        }
    }
    
    updateDisplayData(data) {
        if (data.speed !== undefined) {
            if (data.speed > 0) {
                this.currentSpeed.textContent = `${data.speed.toFixed(1)} km/h`;
            } else {
                this.currentSpeed.textContent = '0.0 km/h';
            }
        }
        
        if (data.distance !== undefined) {
            this.totalDistance.textContent = `${data.distance.toFixed(3)} km`;
        }
        
        if (data.connected !== undefined) {
            this.setConnected(data.connected);
        }
    }
    
    showError(message) {
        // Simple error display - could be enhanced with a proper error UI
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            background: #ffebee;
            color: #c62828;
            padding: 8px 12px;
            border-radius: 4px;
            margin: 8px 0;
            font-size: 12px;
            border-left: 3px solid #c62828;
        `;
        
        const container = document.querySelector('.container');
        const controlsSection = document.querySelector('.controls-section');
        container.insertBefore(errorDiv, controlsSection);
        
        // Remove error after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
    
    startPeriodicUpdates() {
        // Update status every 2 seconds
        setInterval(() => {
            if (this.isConnected) {
                this.updateStatus();
            }
        }, 2000);
    }
    
    updateYouTubeDisplay(status) {
        if (status.isYouTube) {
            this.isYouTube = true;
            this.youtubeSection.style.display = 'block';
            this.youtubeInfo.style.display = 'block';
            
            // Update settings from status
            if (status.youtubeSettings) {
                this.youtubeEnabled.checked = status.youtubeSettings.enabled;
                this.pauseDelay.value = status.youtubeSettings.pauseDelay.toString();
            }
        } else {
            this.isYouTube = false;
            this.youtubeSection.style.display = 'none';
            this.youtubeInfo.style.display = 'none';
        }
    }
    
    async updateYouTubeSettings() {
        if (!this.isYouTube) return;
        
        try {
            const settings = {
                enabled: this.youtubeEnabled.checked,
                pauseDelay: parseInt(this.pauseDelay.value)
            };
            
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send settings update to content script
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'update_youtube_settings', 
                settings: settings 
            });
            
            if (response && response.success) {
                console.log("✅ YouTube settings updated:", response.settings);
            } else {
                console.error("❌ Failed to update YouTube settings");
            }
        } catch (error) {
            console.error("❌ Error updating YouTube settings:", error);
        }
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});

// Background script for iConsole Fitness Tracker
// Handles data persistence and extension lifecycle

class BackgroundService {
    constructor() {
        this.setupEventListeners();
        console.log("🔧 iConsole Tracker background service initialized");
    }
    
    setupEventListeners() {
        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                console.log("🎉 iConsole Tracker extension installed");
                this.initializeStorage();
            } else if (details.reason === 'update') {
                console.log("🔄 iConsole Tracker extension updated");
            }
        });
        
        // Handle extension startup
        chrome.runtime.onStartup.addListener(() => {
            console.log("🚀 iConsole Tracker extension started");
        });
        
        // Handle messages from content scripts and popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
        
        // Handle storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            this.handleStorageChanges(changes, namespace);
        });
    }
    
    async initializeStorage() {
        try {
            // Initialize default values if they don't exist
            const result = await chrome.storage.local.get(['totalDistance', 'sessionCount', 'lastUsed']);
            
            const defaults = {
                totalDistance: result.totalDistance || 0.0,
                sessionCount: result.sessionCount || 0,
                lastUsed: result.lastUsed || new Date().toISOString(),
                settings: {
                    autoConnect: false,
                    logToConsole: true,
                    units: 'metric' // metric or imperial
                }
            };
            
            await chrome.storage.local.set(defaults);
            console.log("💾 Storage initialized with defaults");
            
        } catch (error) {
            console.error("❌ Error initializing storage:", error);
        }
    }
    
    handleMessage(message, sender, sendResponse) {
        switch (message.type) {
            case 'get_total_distance':
                this.getTotalDistance().then(sendResponse);
                break;
                
            case 'update_total_distance':
                this.updateTotalDistance(message.distance).then(sendResponse);
                break;
                
            case 'get_session_stats':
                this.getSessionStats().then(sendResponse);
                break;
                
            case 'increment_session_count':
                this.incrementSessionCount().then(sendResponse);
                break;
                
            case 'reset_total_distance':
                this.resetTotalDistance().then(sendResponse);
                break;
                
            case 'export_data':
                this.exportData().then(sendResponse);
                break;
                
            default:
                console.log("🤷‍♂️ Unknown message type:", message.type);
                sendResponse({ error: 'Unknown message type' });
        }
    }
    
    async getTotalDistance() {
        try {
            const result = await chrome.storage.local.get(['totalDistance']);
            return { distance: result.totalDistance || 0.0 };
        } catch (error) {
            console.error("❌ Error getting total distance:", error);
            return { error: error.message };
        }
    }
    
    async updateTotalDistance(distance) {
        try {
            await chrome.storage.local.set({
                totalDistance: distance,
                lastUsed: new Date().toISOString()
            });
            
            // Update badge if distance is significant
            if (distance > 0) {
                const badgeText = distance >= 1 ? `${Math.floor(distance)}km` : `${Math.floor(distance * 1000)}m`;
                chrome.action.setBadgeText({ text: badgeText });
                chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            } else {
                chrome.action.setBadgeText({ text: '' });
            }
            
            return { success: true };
        } catch (error) {
            console.error("❌ Error updating total distance:", error);
            return { error: error.message };
        }
    }
    
    async getSessionStats() {
        try {
            const result = await chrome.storage.local.get(['sessionCount', 'totalDistance', 'lastUsed']);
            return {
                sessionCount: result.sessionCount || 0,
                totalDistance: result.totalDistance || 0.0,
                lastUsed: result.lastUsed
            };
        } catch (error) {
            console.error("❌ Error getting session stats:", error);
            return { error: error.message };
        }
    }
    
    async incrementSessionCount() {
        try {
            const result = await chrome.storage.local.get(['sessionCount']);
            const newCount = (result.sessionCount || 0) + 1;
            
            await chrome.storage.local.set({
                sessionCount: newCount,
                lastUsed: new Date().toISOString()
            });
            
            return { sessionCount: newCount };
        } catch (error) {
            console.error("❌ Error incrementing session count:", error);
            return { error: error.message };
        }
    }
    
    async resetTotalDistance() {
        try {
            await chrome.storage.local.set({
                totalDistance: 0.0,
                lastUsed: new Date().toISOString()
            });
            
            // Clear badge
            chrome.action.setBadgeText({ text: '' });
            
            console.log("🔄 Total distance reset to 0");
            return { success: true };
        } catch (error) {
            console.error("❌ Error resetting total distance:", error);
            return { error: error.message };
        }
    }
    
    async exportData() {
        try {
            const result = await chrome.storage.local.get();
            
            const exportData = {
                exportDate: new Date().toISOString(),
                totalDistance: result.totalDistance || 0.0,
                sessionCount: result.sessionCount || 0,
                lastUsed: result.lastUsed,
                settings: result.settings || {},
                version: chrome.runtime.getManifest().version
            };
            
            return { data: exportData };
        } catch (error) {
            console.error("❌ Error exporting data:", error);
            return { error: error.message };
        }
    }
    
    handleStorageChanges(changes, namespace) {
        if (namespace === 'local') {
            for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
                console.log(`📊 Storage changed: ${key} = ${oldValue} -> ${newValue}`);
                
                // Update badge when total distance changes
                if (key === 'totalDistance' && newValue !== undefined) {
                    const distance = newValue;
                    if (distance > 0) {
                        const badgeText = distance >= 1 ? `${Math.floor(distance)}km` : `${Math.floor(distance * 1000)}m`;
                        chrome.action.setBadgeText({ text: badgeText });
                        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
                    } else {
                        chrome.action.setBadgeText({ text: '' });
                    }
                }
            }
        }
    }
    
    // Cleanup method for when extension is disabled/uninstalled
    cleanup() {
        console.log("🧹 Background service cleanup");
        // Clear any intervals or timeouts here if needed
    }
}

// Initialize the background service
const backgroundService = new BackgroundService();

// Handle extension suspension (Chrome may suspend background scripts)
chrome.runtime.onSuspend.addListener(() => {
    console.log("😴 Background script suspending");
    backgroundService.cleanup();
});

// Keep service worker alive with periodic tasks
setInterval(() => {
    // Minimal activity to prevent suspension
    chrome.storage.local.get(['lastUsed'], (result) => {
        // Just a simple storage read to keep the service worker active
    });
}, 25000); // Every 25 seconds (Chrome suspends after 30 seconds of inactivity)

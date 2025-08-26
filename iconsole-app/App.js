// Main iConsole Tracker App
import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Alert, AppState, Platform } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { Text, Button, Card, Title, Paragraph, ActivityIndicator, Chip } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import BluetoothService from './services/BluetoothService';
import BackgroundService from './services/BackgroundService';
import ForegroundService from './services/ForegroundService';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#2196F3',
    accent: '#FF9800',
  },
};

export default function App() {
  console.log('App component rendering...');
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    initializeApp();
    
    // Handle app state changes
    const handleAppStateChange = (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App has come to the foreground');
        // Refresh data when app comes to foreground
        refreshData();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
      cleanup();
    };
  }, []);

  const initializeApp = async () => {
    try {
      console.log('Initializing iConsole Tracker...');
    
      // Initialize BluetoothService first
      await BluetoothService.initialize();
    
      // Setup Bluetooth callbacks
      BluetoothService.onSpeedUpdate = (speed) => {
        setCurrentSpeed(speed);
        // Don't update notification here - let background task handle it
      };
      
      BluetoothService.onDistanceUpdate = (distance) => {
        setTotalDistance(distance);
        // Don't update notification here - let background task handle it
      };
      
      BluetoothService.onConnectionChange = (connected) => {
        setIsConnected(connected);
        setIsConnecting(false);
      };

      // Load initial data
      await refreshData();
      
      // Start foreground service for continuous operation
      await ForegroundService.startForegroundService();
      
      console.log('App initialized');
    } catch (error) {
      console.error('Error initializing app:', error);
      Alert.alert('Initialization Error', `Failed to initialize app: ${error.message}`);
    }
  };

  const refreshData = async () => {
    // Get current values from BluetoothService
    setCurrentSpeed(BluetoothService.currentSpeed);
    setTotalDistance(BluetoothService.totalDistance);
    setIsConnected(BluetoothService.isConnected);
    
    // Get last sync time
    const lastSync = await BackgroundService.getLastSyncTime();
    setLastSyncTime(lastSync);
  };

  const cleanup = () => {
    console.log('Cleaning up...');
    BluetoothService.destroy();
    ForegroundService.stopForegroundService();
  };

  const handleConnect = async () => {
    if (isConnected) {
      // Disconnect
      console.log('🔌 User requested disconnect');
      try {
        await BluetoothService.disconnect();
        console.log('✅ Disconnected successfully');
        Alert.alert('Disconnected', 'Disconnected from iConsole device');
      } catch (error) {
        console.error('❌ Disconnect failed:', error);
        Alert.alert('Error', `Failed to disconnect: ${error.message}`);
      }
    } else {
      // Connect
      console.log('🔌 User requested connect');
      setIsConnecting(true);
      try {
        console.log('🔍 Starting findAndConnect...');
        await BluetoothService.findAndConnect();
        console.log('✅ Connected successfully!');
        Alert.alert('Connected', 'Successfully connected to iConsole device!');
      } catch (error) {
        console.error('❌ Connection failed:', error);
        Alert.alert('Connection Failed', `Could not connect to iConsole device: ${error.message}`);
        setIsConnecting(false);
      }
    }
  };

  const formatSpeed = (speed) => {
    return speed.toFixed(1);
  };

  const formatDistance = (distance) => {
    return distance.toFixed(2);
  };

  const formatSyncTime = (time) => {
    if (!time) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - time) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <SafeAreaView style={styles.container}>
        <StatusBar style="auto" />
        
        {/* Header */}
        <View style={styles.header}>
          <Title style={styles.title}>🚴 iConsole Tracker</Title>
          <Chip 
            mode={isConnected ? 'flat' : 'outlined'}
            style={[styles.statusChip, isConnected ? styles.connectedChip : styles.disconnectedChip]}
          >
            {isConnected ? 'Connected' : 'Disconnected'}
          </Chip>
        </View>

        {/* Speed Display */} 
        <Card style={styles.dataCard}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Current Speed</Text>
              <Text style={styles.speedValue}>{formatSpeed(currentSpeed)}</Text>
              <Text style={styles.unit}>km/h</Text>
            </View>
          </Card.Content>
        </Card>

        {/* Distance Display */}
        <Card style={styles.dataCard}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Total Distance</Text>
              <Text style={styles.distanceValue}>{formatDistance(totalDistance)}</Text>
              <Text style={styles.unit}>km</Text>
            </View>
          </Card.Content>
        </Card>

        {/* Connection Button */}
        <View style={styles.buttonContainer}>
          <Button
            mode="contained"
            onPress={handleConnect}
            disabled={isConnecting}
            style={styles.connectButton}
            contentStyle={styles.buttonContent}
          >
            {isConnecting ? (
              <ActivityIndicator color="white" />
            ) : isConnected ? (
              'Disconnect'
            ) : (
              'Connect to iConsole'
            )}
          </Button>
          
          {/* Test Button for debugging */}
          <Button
            mode="outlined"
            onPress={() => {
              console.log('🧪 Starting test data...');
              BluetoothService.startTestData();
            }}
            style={[styles.connectButton, { marginTop: 10 }]}
            contentStyle={styles.buttonContent}
          >
            Start Test Data
          </Button>
          
          {/* Test Notification Button */}
          <Button
            mode="outlined"
            onPress={() => {
              console.log('🧪 Testing notification...');
              ForegroundService.testNotificationUpdate(Math.random() * 30 + 10, Math.random() * 50 + 5);
            }}
            style={[styles.connectButton, { marginTop: 10 }]}
            contentStyle={styles.buttonContent}
          >
            Test Notification
          </Button>

          {/* Battery Optimization Button */}
          <Button
            mode="outlined"
            onPress={() => {
              console.log('🔋 Checking battery optimization...');
              ForegroundService.promptBatteryOptimization();
            }}
            style={[styles.connectButton, { marginTop: 10 }]}
            contentStyle={styles.buttonContent}
          >
            Check Battery Settings
          </Button>
        </View>

        {/* Status Info */}
        <Card style={styles.statusCard}>
          <Card.Content>
            <Paragraph style={styles.statusText}>
              Last Backend Sync: {formatSyncTime(lastSyncTime)}
            </Paragraph>
            <Paragraph style={styles.statusText}>
              Background recording is {isConnected ? 'active' : 'inactive'}
            </Paragraph>
            <Paragraph style={styles.statusText}>
              Persistent notification is enabled
            </Paragraph>
          </Card.Content>
        </Card>
        </SafeAreaView>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 10,
  },
  statusChip: {
    marginBottom: 10,
  },
  connectedChip: {
    backgroundColor: '#4CAF50',
  },
  disconnectedChip: {
    backgroundColor: '#f44336',
  },
  dataCard: {
    marginBottom: 15,
    elevation: 4,
  },
  cardContent: {
    paddingVertical: 20,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  dataLabel: {
    fontSize: 16,
    color: '#666',
    marginRight: 10,
  },
  speedValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2196F3',
    marginRight: 5,
  },
  distanceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FF9800',
    marginRight: 5,
  },
  unit: {
    fontSize: 18,
    color: '#666',
  },
  buttonContainer: {
    marginVertical: 30,
  },
  connectButton: {
    paddingVertical: 5,
  },
  buttonContent: {
    paddingVertical: 10,
  },
  statusCard: {
    marginTop: 20,
    backgroundColor: '#fff',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
});

// Main iConsole Tracker App
import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Alert, AppState, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useFonts, Merriweather_400Regular, Merriweather_700Bold } from '@expo-google-fonts/merriweather';
import { Provider as PaperProvider, MD3DarkTheme, BottomNavigation } from 'react-native-paper';
import { Text, Button, Card, Title, Paragraph, ActivityIndicator, Chip, Surface, Divider, IconButton, FAB, Appbar, Badge, Menu } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { Dimensions, ScrollView } from 'react-native';
import BluetoothService from './services/BluetoothService';
import ForegroundService from './services/ForegroundService';

// Custom theme colors
const customColors = {
  // Main background colors
  background: '#0f0f0f',        // Main app background 
  surface: '#0f0f0f',           // Bottom navigation, cards, elevated surfaces
  surfaceDark: '#0f0f0f',       // Bottom navigation, cards, elevated surfaces
  surfaceVariant: '#1a1a1a',   // Card backgrounds
  
  // Primary colors
  primary: '#2196F3',          // Blue accent
  secondary: '#FF9800',        // Orange accent
  
  // Text colors
  onBackground: '#FFFFFF',     // Primary text on background
  onSurface: '#FFFFFF',        // Primary text on surfaces
  onSurfaceVariant: '#B3B3B3', // Secondary text
  
  // Status colors
  success: '#4CAF50',          // Connected status
  error: '#f44336',            // Disconnected status
  
  // Other MD3 colors (keeping defaults but ensuring consistency)
  outline: '#79747E',
  outlineVariant: '#49454F',
  inverseSurface: '#E6E1E5',
  inverseOnSurface: '#1C1B1F',
  inversePrimary: '#006A6B',
};

const theme = {
  ...MD3DarkTheme,
  fonts: {
    ...MD3DarkTheme.fonts,
    default: {
      fontFamily: 'System',
      fontWeight: '400',
    },
    displayLarge: {
      fontFamily: 'System',
      fontWeight: '700',
    },
    displayMedium: {
      fontFamily: 'System',
      fontWeight: '700',
    },
    displaySmall: {
      fontFamily: 'System',
      fontWeight: '700',
    },
    headlineLarge: {
      fontFamily: 'System',
      fontWeight: '600',
    },
    headlineMedium: {
      fontFamily: 'System',
      fontWeight: '600',
    },
    headlineSmall: {
      fontFamily: 'System',
      fontWeight: '600',
    },
    titleLarge: {
      fontFamily: 'System',
      fontWeight: '600',
    },
    titleMedium: {
      fontFamily: 'System',
      fontWeight: '500',
    },
    titleSmall: {
      fontFamily: 'System',
      fontWeight: '500',
    },
    bodyLarge: {
      fontFamily: 'System',
      fontWeight: '400',
    },
    bodyMedium: {
      fontFamily: 'System',
      fontWeight: '400',
    },
    bodySmall: {
      fontFamily: 'System',
      fontWeight: '400',
    },
    labelLarge: {
      fontFamily: 'System',
      fontWeight: '500',
    },
    labelMedium: {
      fontFamily: 'System',
      fontWeight: '500',
    },
    labelSmall: {
      fontFamily: 'System',
      fontWeight: '500',
    },
  },
  colors: {
    ...MD3DarkTheme.colors,
    ...customColors,
  },
};

export default function App() {
  console.log('App component rendering...');
  
  // Load Merriweather font
  let [fontsLoaded] = useFonts({
    Merriweather_400Regular,
    Merriweather_700Bold,
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [showBatteryButton, setShowBatteryButton] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [deviceMenuVisible, setDeviceMenuVisible] = useState(false);
  const [speedHistory, setSpeedHistory] = useState([]);
  const [distanceHistory, setDistanceHistory] = useState([]);
  const [timeLabels, setTimeLabels] = useState([]);
  const [totalTimeToday, setTotalTimeToday] = useState(0); // in minutes
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [caloriesBurnt, setCaloriesBurnt] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [previousDayStats, setPreviousDayStats] = useState({
    avgSpeed: 0,
    maxSpeed: 0,
    calories: 0
  });
  const [streakDays, setStreakDays] = useState(7); // Sample streak of 7 days
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'home', title: 'Home', focusedIcon: 'home', unfocusedIcon: 'home-outline' },
    { key: 'community', title: 'Community', focusedIcon: 'account-group', unfocusedIcon: 'account-group-outline' },
    { key: 'settings', title: 'Settings', focusedIcon: 'cog', unfocusedIcon: 'cog-outline' },
  ]);

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    initializeApp();
    
    // Handle app state changes
    const handleAppStateChange = (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App has come to the foreground');
        // Refresh data when app comes to foreground
        refreshData();
        // Update available devices from foreground service
        const devices = ForegroundService.getAvailableDevices();
        if (devices.length > 0) {
          setAvailableDevices(devices);
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
      // Only cleanup when the app is actually being terminated, not during normal React lifecycle
      // This prevents the BleManager from being destroyed during development hot reloads
      console.log('Component cleanup - preserving BluetoothService for app stability');
    };
  }, []);

  const initializeApp = async () => {
    try {
      console.log('Initializing iConsole Tracker...');
      
      // Initialize BluetoothService FIRST before anything else
      console.log('Initializing BluetoothService...');
      await BluetoothService.initialize();
      console.log('BluetoothService initialized successfully');
      
      // Set navigation bar color for Android to match Paper's BottomNavigation exactly
      if (Platform.OS === 'android') {
        try {
          // Use the theme's surface color that BottomNavigation uses
          const navigationBarColor = theme.colors.surface;
          await NavigationBar.setBackgroundColorAsync(navigationBarColor);
          await NavigationBar.setButtonStyleAsync('light');
          console.log('Navigation bar color set to theme surface color:', navigationBarColor);
        } catch (error) {
          console.log('Failed to set navigation bar color:', error);
        }
      }
    
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
      
      // Generate sample chart data
      generateSampleData();
      
      // Start background services for notifications and data sync
      // await BackgroundService.startBackgroundServices();
      
      // Start foreground service for continuous operation
      await ForegroundService.startForegroundService();
      
      // Set up callback for device discovery from foreground service
      ForegroundService.setDevicesFoundCallback((devices) => {
        console.log(`📱 Received ${devices.length} devices from foreground service`);
        setAvailableDevices(devices);
      });
      
      // Check if battery optimization button should be shown (Android only)
      if (Platform.OS === 'android') {
        try {
          const batteryOptimizationEnabled = await import('@notifee/react-native')
            .then(notifee => notifee.default.isBatteryOptimizationEnabled());
          setShowBatteryButton(batteryOptimizationEnabled);
        } catch (error) {
          console.log('Could not check battery optimization status');
        }
      }
      
      console.log('App initialized');
    } catch (error) {
      console.error('Error initializing app:', error);
      Alert.alert('Initialization Error', `Failed to initialize app: ${error.message}`);
    }
  };

  const refreshData = async () => {
    // Only refresh data if BluetoothService is initialized
    if (BluetoothService.isInitialized) {
      // Get current values from BluetoothService
      setCurrentSpeed(BluetoothService.currentSpeed);
      setTotalDistance(BluetoothService.totalDistance);
      setIsConnected(BluetoothService.isConnected);
    } else {
      console.log('BluetoothService not yet initialized, skipping data refresh');
    }
  };

  const cleanup = () => {
    console.log('Cleaning up...');
    BluetoothService.destroy();
    BackgroundService.stopBackgroundServices();
    ForegroundService.stopForegroundService();
  };

  const handleScanForDevices = async () => {
    if (!BluetoothService.isInitialized) {
      console.log('BluetoothService not initialized yet');
      Alert.alert('Please Wait', 'Bluetooth service is still initializing. Please try again in a moment.');
      return;
    }

    setIsScanning(true);
    try {
      console.log('🔍 Manual scan triggered from UI...');
      
      // Try to get devices from foreground service first (if it has recent data)
      let devices = ForegroundService.getAvailableDevices();
      
      // If no devices or want fresh scan, trigger manual scan
      if (devices.length === 0) {
        console.log('🔍 No cached devices, performing fresh scan...');
        devices = await ForegroundService.triggerManualScan();
      } else {
        console.log(`📱 Using cached devices from foreground service: ${devices.length} devices`);
        // Still trigger a background refresh for next time
        ForegroundService.triggerManualScan().catch(error => {
          console.warn('Background refresh scan failed:', error);
        });
      }
      
      console.log(`Found ${devices.length} devices`);
      setAvailableDevices(devices);
      
      if (devices.length === 0) {
        Alert.alert('No Devices Found', 'No Bluetooth devices were found. Make sure your iConsole device is powered on and in pairing mode.\n\nThe foreground service will continue scanning automatically.');
      } else {
        Alert.alert('Scan Complete', `Found ${devices.length} Bluetooth devices. Select one from the dropdown to connect.\n\nThe foreground service will continue scanning for more devices automatically.`);
      }
    } catch (error) {
      console.error('❌ Device scan failed:', error);
      Alert.alert('Scan Failed', `Could not scan for devices: ${error.message}\n\nThe foreground service will continue trying automatically.`);
      setAvailableDevices([]);
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnectToSelectedDevice = async () => {
    if (!selectedDevice) {
      Alert.alert('No Device Selected', 'Please select a device from the dropdown first.');
      return;
    }

    if (!BluetoothService.isInitialized) {
      console.log('BluetoothService not initialized yet');
      Alert.alert('Please Wait', 'Bluetooth service is still initializing. Please try again in a moment.');
      return;
    }

    setIsConnecting(true);
    try {
      console.log(`🔌 Connecting to selected device: ${selectedDevice.displayName}`);
      await BluetoothService.connectToDeviceById(selectedDevice.id);
      console.log('✅ Connected successfully!');
      Alert.alert('Connected', `Successfully connected to ${selectedDevice.displayName}!`);
    } catch (error) {
      console.error('❌ Connection failed:', error);
      Alert.alert('Connection Failed', `Could not connect to ${selectedDevice.displayName}: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const handleConnect = async () => {
    // Check if BluetoothService is initialized
    if (!BluetoothService.isInitialized) {
      console.log('BluetoothService not initialized yet');
      Alert.alert('Please Wait', 'Bluetooth service is still initializing. Please try again in a moment.');
      return;
    }

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
      // If a device is selected, connect to it, otherwise use auto-connect
      if (selectedDevice) {
        await handleConnectToSelectedDevice();
      } else {
        // Auto-connect (backward compatibility)
        console.log('🔌 User requested auto-connect');
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
    }
  };

  const formatSpeed = (speed) => {
    return speed.toFixed(1);
  };

  const formatDistance = (distance) => {
    return distance.toFixed(2);
  };

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatDateDisplay = (date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'TODAY';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'YESTERDAY';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }).toUpperCase();
    }
  };

  const navigateDate = (direction) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction);
    
    // Prevent selecting future dates
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Set to end of today
    
    if (newDate > today) {
      return; // Don't allow future dates
    }
    
    setSelectedDate(newDate);
    
    // Generate new data for the selected date
    generateSampleData();
  };

  const getComparisonIcon = (currentValue, previousValue) => {
    const difference = currentValue - previousValue;
    const threshold = currentValue * 0.05; // 5% threshold for "equal"
    
    if (Math.abs(difference) <= threshold) {
      return 'circle-medium'; // Grey dot for roughly equal
    } else if (difference > 0) {
      return 'arrow-up'; // Green up arrow for higher
    } else {
      return 'arrow-down'; // Red down arrow for lower
    }
  };

  const getComparisonColor = (currentValue, previousValue) => {
    const difference = currentValue - previousValue;
    const threshold = currentValue * 0.05;
    
    if (Math.abs(difference) <= threshold) {
      return customColors.onSurfaceVariant; // Grey for equal
    } else if (difference > 0) {
      return customColors.success; // Green for higher
    } else {
      return customColors.error; // Red for lower
    }
  };

  // Generate sample data for charts (replace with real data later)
  const generateSampleData = () => {
    const hours = 6; // Show last 6 hours
    const speedData = [];
    const distanceData = [];
    
    for (let i = hours; i >= 0; i--) {
      const time = new Date();
      time.setHours(time.getHours() - i);
      const label = time.getHours() + ':00';
      
      // Generate realistic sample data for gifted-charts format
      speedData.push({
        value: Math.random() * 25 + 5, // 5-30 km/h
        label: label,
        dataPointText: (Math.random() * 25 + 5).toFixed(1)
      });
      
      distanceData.push({
        value: Math.random() * 10 + (hours - i) * 2, // Cumulative distance
        label: label,
        frontColor: customColors.secondary
      });
    }
    
    setSpeedHistory(speedData);
    setDistanceHistory(distanceData);
    
    // Generate sample total time for today (in minutes)
    setTotalTimeToday(Math.floor(Math.random() * 180) + 60); // 60-240 minutes
    
    // Generate sample stats
    const speeds = speedData.map(item => item.value);
    const currentMaxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    const currentAvgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const currentCalories = Math.floor(Math.random() * 500) + 200; // 200-700 calories
    
    setMaxSpeed(currentMaxSpeed);
    setAvgSpeed(currentAvgSpeed);
    setCaloriesBurnt(currentCalories);
    
    // Generate previous day stats for comparison (slightly different values)
    setPreviousDayStats({
      avgSpeed: currentAvgSpeed + (Math.random() - 0.5) * 10, // ±5 km/h variation
      maxSpeed: currentMaxSpeed + (Math.random() - 0.5) * 15, // ±7.5 km/h variation
      calories: currentCalories + Math.floor((Math.random() - 0.5) * 200) // ±100 calories variation
    });
  };

  // Get screen dimensions for charts
  const screenWidth = Dimensions.get('window').width;

  // Home Screen Component
  const HomeRoute = () => (
    <LinearGradient
      colors={['#0a0a0a', '#0f0f0f', '#141414']}
      style={styles.screenContainer}
    >
      {/* Top Bar with Streak, Date Navigation, and Connection */}
      <View style={styles.topBar}>
        {/* Streak Counter - Left */}
        <View style={styles.streakContainer}>
          <IconButton 
            icon="fire" 
            iconColor={customColors.secondary}
            size={20}
          />
          <Text style={styles.streakText}>{streakDays}</Text>
        </View>

        {/* Date Navigation - Center */}
        <View style={styles.dateNavigationCenter}>
          <IconButton 
            icon="chevron-left" 
            iconColor={customColors.onSurface}
            size={24}
            onPress={() => navigateDate(-1)}
          />
          <Text style={styles.dateText}>{formatDateDisplay(selectedDate)}</Text>
          <IconButton 
            icon="chevron-right" 
            iconColor={selectedDate.toDateString() === new Date().toDateString() ? customColors.onSurfaceVariant : customColors.onSurface}
            size={24}
            onPress={() => navigateDate(1)}
            disabled={selectedDate.toDateString() === new Date().toDateString()}
          />
        </View>

        {/* Connection Status - Right */}
        <View style={styles.connectionContainer}>
          <IconButton 
            icon={isConnected ? "wifi" : "wifi-off"}
            iconColor={isConnected ? customColors.success : customColors.error}
            size={20}
            onPress={() => {
              if (!isConnected) {
                setIndex(2); // Navigate to Settings tab (index 2)
              }
            }}
          />
        </View>
      </View>

      {/* Simple Header */}
      <View style={styles.simpleHeader}>
        <Text style={styles.appTitle}>SITZIP</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Stats Row - Three Cards */}
        <View style={styles.statsRow}>
          <Surface style={styles.statCard} elevation={3}>
            <View style={styles.statContent}>
              <IconButton icon="speedometer" iconColor={customColors.primary} size={28} />
              <Text variant="titleLarge" style={styles.statValue}>
                {formatSpeed(currentSpeed)}
              </Text>
              <Text variant="bodySmall" style={styles.statLabel}>km/h</Text>
              <Text variant="labelSmall" style={styles.statSubLabel}>Current Speed</Text>
            </View>
          </Surface>

          <Surface style={styles.statCard} elevation={3}>
            <View style={styles.statContent}>
              <IconButton icon="map-marker-distance" iconColor={customColors.secondary} size={28} />
              <Text variant="titleLarge" style={styles.statValue}>
                {formatDistance(totalDistance)}
              </Text>
              <Text variant="bodySmall" style={styles.statLabel}>km</Text>
              <Text variant="labelSmall" style={styles.statSubLabel}>Total Distance</Text>
            </View>
          </Surface>

          <Surface style={styles.statCard} elevation={3}>
            <View style={styles.statContent}>
              <IconButton icon="clock-outline" iconColor={customColors.success} size={28} />
              <Text variant="titleLarge" style={styles.statValue}>
                {formatTime(totalTimeToday)}
              </Text>
              <Text variant="bodySmall" style={styles.statLabel}>today</Text>
              <Text variant="labelSmall" style={styles.statSubLabel}>Time Moving</Text>
            </View>
          </Surface>
        </View>

        {/* Speed Chart */}
        <Card style={styles.chartCard} mode="elevated">
          <Card.Content>
            <View style={styles.chartHeader}>
              <IconButton icon="chart-line" iconColor={customColors.primary} size={24} />
              <Text variant="titleLarge" style={styles.chartTitle}>Speed Over Time</Text>
            </View>
            {speedHistory.length > 0 && (
              <View style={styles.chartContainer}>
                <LineChart
                  data={speedHistory}
                  width={screenWidth - 120}
                  height={180}
                  color={customColors.primary}
                  thickness={3}
                  curved
                  dataPointsColor={customColors.primary}
                  dataPointsRadius={4}
                  textColor={customColors.onSurfaceVariant}
                  textFontSize={12}
                  hideRules
                  yAxisColor={customColors.outline}
                  xAxisColor={customColors.outline}
                  backgroundColor="transparent"
                  initialSpacing={10}
                  endSpacing={10}
                  yAxisLabelWidth={40}
                  xAxisLabelTextStyle={{color: customColors.onSurfaceVariant, fontSize: 10}}
                  yAxisTextStyle={{color: customColors.onSurfaceVariant, fontSize: 10}}
                />
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Distance Chart */}
        <Card style={styles.chartCard} mode="elevated">
          <Card.Content>
            <View style={styles.chartHeader}>
              <IconButton icon="chart-bar" iconColor={customColors.secondary} size={24} />
              <Text variant="titleLarge" style={styles.chartTitle}>Cumulative Distance</Text>
            </View>
            {distanceHistory.length > 0 && (
              <View style={styles.chartContainer}>
                <BarChart
                  data={distanceHistory}
                  width={screenWidth - 120}
                  height={180}
                  barWidth={25}
                  spacing={15}
                  roundedTop
                  roundedBottom
                  hideRules
                  yAxisColor={customColors.outline}
                  xAxisColor={customColors.outline}
                  textColor={customColors.onSurfaceVariant}
                  textFontSize={12}
                  initialSpacing={10}
                  endSpacing={10}
                  yAxisLabelWidth={40}
                  xAxisLabelTextStyle={{color: customColors.onSurfaceVariant, fontSize: 10}}
                  yAxisTextStyle={{color: customColors.onSurfaceVariant, fontSize: 10}}
                />
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Horizontal Stat Cards */}
        <Card style={styles.horizontalStatCard} mode="elevated">
          <Card.Content style={styles.horizontalStatContent}>
            <IconButton icon="speedometer" iconColor={customColors.primary} size={24} />
            <Text variant="titleMedium" style={styles.horizontalStatTitle}>AVERAGE SPEED</Text>
            <View style={styles.statValueContainer}>
              <Text variant="headlineSmall" style={styles.horizontalStatValue}>{avgSpeed.toFixed(1)}</Text>
              <IconButton 
                icon={getComparisonIcon(avgSpeed, previousDayStats.avgSpeed)}
                iconColor={getComparisonColor(avgSpeed, previousDayStats.avgSpeed)}
                size={16}
                style={styles.comparisonIcon}
              />
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.horizontalStatCard} mode="elevated">
          <Card.Content style={styles.horizontalStatContent}>
            <IconButton icon="speedometer-medium" iconColor={customColors.success} size={24} />
            <Text variant="titleMedium" style={styles.horizontalStatTitle}>MAX SPEED</Text>
            <View style={styles.statValueContainer}>
              <Text variant="headlineSmall" style={styles.horizontalStatValue}>{maxSpeed.toFixed(1)}</Text>
              <IconButton 
                icon={getComparisonIcon(maxSpeed, previousDayStats.maxSpeed)}
                iconColor={getComparisonColor(maxSpeed, previousDayStats.maxSpeed)}
                size={16}
                style={styles.comparisonIcon}
              />
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.horizontalStatCard} mode="elevated">
          <Card.Content style={styles.horizontalStatContent}>
            <IconButton icon="fire" iconColor={customColors.secondary} size={24} />
            <Text variant="titleMedium" style={styles.horizontalStatTitle}>CALORIES</Text>
            <View style={styles.statValueContainer}>
              <Text variant="headlineSmall" style={styles.horizontalStatValue}>{caloriesBurnt}</Text>
              <IconButton 
                icon={getComparisonIcon(caloriesBurnt, previousDayStats.calories)}
                iconColor={getComparisonColor(caloriesBurnt, previousDayStats.calories)}
                size={16}
                style={styles.comparisonIcon}
              />
            </View>
          </Card.Content>
        </Card>


      </ScrollView>
    </LinearGradient>
  );

  // Community Screen Component
  const CommunityRoute = () => (
    <LinearGradient
      colors={['#0a0a0a', '#0f0f0f', '#141414']}
      style={styles.screenContainer}
    >
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content 
          title="🌟 Community" 
          titleStyle={styles.appbarTitle}
        />
        <IconButton icon="account-group" iconColor={customColors.secondary} />
      </Appbar.Header>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

      <Surface style={styles.featureSurface} elevation={2}>
        <View style={styles.featureHeader}>
          <IconButton icon="rocket-launch" iconColor={customColors.primary} size={32} />
          <Text variant="headlineSmall" style={styles.featureTitle}>Coming Soon!</Text>
        </View>
        <Divider style={styles.featureDivider} />
        <Text variant="bodyLarge" style={styles.featureDescription}>
          Connect with other iConsole users, share your rides, and compete in challenges.
        </Text>
      </Surface>

      <Card style={styles.featureCard} mode="elevated">
        <Card.Content>
          <View style={styles.featureItem}>
            <IconButton icon="share-variant" iconColor={customColors.success} />
            <View style={styles.featureText}>
              <Text variant="titleMedium" style={styles.featureItemTitle}>Share Rides</Text>
              <Text variant="bodyMedium" style={styles.featureItemDesc}>Share your cycling achievements</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.featureCard} mode="elevated">
        <Card.Content>
          <View style={styles.featureItem}>
            <IconButton icon="trophy" iconColor={customColors.secondary} />
            <View style={styles.featureText}>
              <Text variant="titleMedium" style={styles.featureItemTitle}>Challenges</Text>
              <Text variant="bodyMedium" style={styles.featureItemDesc}>Compete in weekly challenges</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.featureCard} mode="elevated">
        <Card.Content>
          <View style={styles.featureItem}>
            <IconButton icon="account-multiple" iconColor={customColors.primary} />
            <View style={styles.featureText}>
              <Text variant="titleMedium" style={styles.featureItemTitle}>Connect</Text>
              <Text variant="bodyMedium" style={styles.featureItemDesc}>Find other cyclists nearby</Text>
            </View>
          </View>
        </Card.Content>
      </Card>
      </ScrollView>
    </LinearGradient>
  );

  // Settings Screen Component
  const SettingsRoute = () => (
    <LinearGradient
      colors={['#0a0a0a', '#0f0f0f', '#141414']}
      style={styles.screenContainer}
    >
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content 
          title="⚙️ Settings" 
          titleStyle={styles.appbarTitle}
        />
        <IconButton icon="cog" iconColor={customColors.primary} />
      </Appbar.Header>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

      {/* Connection Status Section */}
      <Surface style={styles.connectionSurface} elevation={3}>
        <View style={styles.connectionHeader}>
          <IconButton 
            icon={isConnected ? "bluetooth-connect" : "bluetooth-off"} 
            iconColor={isConnected ? customColors.success : customColors.error}
            size={32}
          />
          <View style={styles.connectionInfo}>
            <Text variant="titleLarge" style={styles.connectionTitle}>
              iConsole Device
            </Text>
            <Text variant="bodyMedium" style={styles.connectionStatus}>
              {isConnected ? (selectedDevice ? `Connected to ${selectedDevice.displayName}` : 'Connected') : 'Disconnected'}
            </Text>
          </View>
          <Chip 
            mode="flat"
            style={[isConnected ? styles.connectedChip : styles.disconnectedChip]}
            textStyle={styles.chipText}
          >
            {isConnected ? 'Online' : 'Offline'}
          </Chip>
        </View>
        
        <Divider style={styles.connectionDivider} />
        
        {/* Device Selection Section */}
        <View style={styles.deviceSelectionSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>Device Selection</Text>
          
          {/* Scan for Devices Button */}
          <Button
            mode="outlined"
            onPress={handleScanForDevices}
            disabled={isScanning || isConnecting}
            style={styles.scanButton}
            contentStyle={styles.buttonContent}
            icon="radar"
          >
            {isScanning ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="small" color={customColors.primary} />
                <Text style={styles.scanningText}>Scanning...</Text>
              </View>
            ) : (
              'Scan for Devices'
            )}
          </Button>

          {/* Device Dropdown */}
          {availableDevices.length > 0 && (
            <View style={styles.dropdownContainer}>
              <Text variant="bodyMedium" style={styles.dropdownLabel}>Select Device:</Text>
              <Menu
                visible={deviceMenuVisible}
                onDismiss={() => setDeviceMenuVisible(false)}
                anchor={
                  <Button
                    mode="outlined"
                    onPress={() => setDeviceMenuVisible(true)}
                    style={styles.dropdownButton}
                    contentStyle={styles.dropdownButtonContent}
                    icon="chevron-down"
                  >
                    {selectedDevice ? selectedDevice.displayName : 'Choose Device'}
                  </Button>
                }
                contentStyle={styles.menuContent}
              >
                {availableDevices.map((device, index) => (
                  <Menu.Item
                    key={device.id}
                    onPress={() => {
                      setSelectedDevice(device);
                      setDeviceMenuVisible(false);
                    }}
                    title={device.displayName}
                    leadingIcon="bluetooth"
                    style={styles.menuItem}
                    titleStyle={styles.menuItemTitle}
                  />
                ))}
              </Menu>
            </View>
          )}
        </View>
        
        <Divider style={styles.connectionDivider} />
        
        {/* Connection Actions */}
        <View style={styles.connectionActions}>
          <Button
            mode="contained"
            onPress={handleConnect}
            disabled={isConnecting}
            style={styles.connectionButton}
            contentStyle={styles.buttonContent}
            icon={isConnected ? "bluetooth-off" : "bluetooth"}
          >
            {isConnecting ? (
              <ActivityIndicator color="white" />
            ) : isConnected ? (
              'Disconnect Device'
            ) : selectedDevice ? (
              `Connect to ${selectedDevice.displayName}`
            ) : (
              'Auto-Connect to iConsole'
            )}
          </Button>

          {/* Battery Optimization Button - only show if needed */}
          {showBatteryButton && (
            <Button
              mode="outlined"
              onPress={() => {
                console.log('🔋 Opening battery optimization settings...');
                ForegroundService.promptBatteryOptimization();
              }}
              style={[styles.connectionButton, { marginTop: 12 }]}
              contentStyle={styles.buttonContent}
              icon="battery-outline"
            >
              Optimize Battery Settings
            </Button>
          )}
        </View>
      </Surface>

      {/* Settings Options */}
      <Card style={styles.featureCard} mode="elevated">
        <Card.Content>
          <View style={styles.featureItem}>
            <IconButton icon="speedometer" iconColor={customColors.primary} />
            <View style={styles.featureText}>
              <Text variant="titleMedium" style={styles.featureItemTitle}>Units</Text>
              <Text variant="bodyMedium" style={styles.featureItemDesc}>Speed and distance preferences</Text>
            </View>
            <IconButton icon="chevron-right" iconColor={customColors.onSurfaceVariant} />
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.featureCard} mode="elevated">
        <Card.Content>
          <View style={styles.featureItem}>
            <IconButton icon="bell" iconColor={customColors.success} />
            <View style={styles.featureText}>
              <Text variant="titleMedium" style={styles.featureItemTitle}>Notifications</Text>
              <Text variant="bodyMedium" style={styles.featureItemDesc}>Manage alert preferences</Text>
            </View>
            <IconButton icon="chevron-right" iconColor={customColors.onSurfaceVariant} />
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.featureCard} mode="elevated">
        <Card.Content>
          <View style={styles.featureItem}>
            <IconButton icon="chart-line" iconColor={customColors.secondary} />
            <View style={styles.featureText}>
              <Text variant="titleMedium" style={styles.featureItemTitle}>Data & Charts</Text>
              <Text variant="bodyMedium" style={styles.featureItemDesc}>Chart preferences and data export</Text>
            </View>
            <IconButton icon="chevron-right" iconColor={customColors.onSurfaceVariant} />
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.featureCard} mode="elevated">
        <Card.Content>
          <View style={styles.featureItem}>
            <IconButton icon="information" iconColor={customColors.primary} />
            <View style={styles.featureText}>
              <Text variant="titleMedium" style={styles.featureItemTitle}>About</Text>
              <Text variant="bodyMedium" style={styles.featureItemDesc}>App version and info</Text>
            </View>
            <IconButton icon="chevron-right" iconColor={customColors.onSurfaceVariant} />
          </View>
        </Card.Content>
      </Card>
      </ScrollView>
    </LinearGradient>
  );

  const renderScene = BottomNavigation.SceneMap({
    home: HomeRoute,
    community: CommunityRoute,
    settings: SettingsRoute,
  });



  // Don't render until fonts are loaded
  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <LinearGradient
          colors={['#0a0a0a', '#0f0f0f', '#141414']}
          style={styles.container}
        >
          <SafeAreaView style={styles.safeArea}>
            <StatusBar style="light" />
            <View style={styles.contentArea}>
              <BottomNavigation
                navigationState={{ index, routes }}
                onIndexChange={setIndex}
                renderScene={renderScene}
                theme={theme}
                barStyle={{ 
                  backgroundColor: theme.colors.surfaceDark,
                  borderTopWidth: 1,
                  borderTopColor: '#2a2a2a'
                }}
              />
            </View>
          </SafeAreaView>
        </LinearGradient>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // Add padding to prevent overlap with bottom navigation
  },
  // Simple header styles
  simpleHeader: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 0,
    marginBottom: 8,
  },
  appTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Merriweather_700Bold',
    textAlign: 'center',
    letterSpacing: 1,
  },
  // Top bar with streak, date, and connection
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
    marginBottom: 2,
    paddingHorizontal: 16,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  streakText: {
    color: customColors.onSurface,
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: -8,
  },
  dateNavigationCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 2,
  },
  connectionContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  dateText: {
    color: customColors.onSurface,
    fontSize: 14,
    fontWeight: 'bold',
    marginHorizontal: 2,
    minWidth: 80,
    textAlign: 'center',
  },
  connectionBadge: {
    backgroundColor: customColors.success,
    position: 'absolute',
    right: 16,
    top: 5,
  },
  // Status surface styles
  statusSurface: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: customColors.surfaceVariant,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    flex: 1,
    marginLeft: 8,
    color: customColors.onSurface,
  },
  connectedChip: {
    backgroundColor: customColors.success,
  },
  disconnectedChip: {
    backgroundColor: customColors.error,
  },
  chipText: {
    color: customColors.onSurface,
    fontSize: 12,
  },
  // Divider
  divider: {
    marginHorizontal: 16,
    backgroundColor: customColors.outline,
  },
  // Data card styles
  dataCard: {
    margin: 16,
    marginVertical: 8,
    backgroundColor: customColors.surfaceVariant,
  },
  cardContent: {
    paddingVertical: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: customColors.onSurface,
    marginLeft: 8,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  speedValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: customColors.primary,
    marginRight: 8,
  },
  distanceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: customColors.secondary,
    marginRight: 8,
  },
  unit: {
    fontSize: 18,
    color: customColors.onSurfaceVariant,
  },
  // Action surface styles
  actionSurface: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: customColors.surfaceVariant,
  },
  connectButton: {
    marginVertical: 4,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  // Stats row styles (Home page)
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: customColors.surfaceVariant,
    minHeight: 100,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  statContent: {
    alignItems: 'center',
    padding: 10,
    justifyContent: 'center',
    flex: 1,
  },
  statValue: {
    color: customColors.onSurface,
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'center',
  },
  statLabel: {
    color: customColors.onSurfaceVariant,
    marginTop: 2,
    textAlign: 'center',
  },
  statSubLabel: {
    color: customColors.onSurfaceVariant,
    marginTop: 6,
    textAlign: 'center',
    fontSize: 10,
  },
  // Chart styles
  chartCard: {
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: customColors.surfaceVariant,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    color: customColors.onSurface,
    marginLeft: 8,
  },
  chartContainer: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  // Horizontal stat cards
  horizontalStatCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: customColors.surfaceVariant,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  horizontalStatContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  horizontalStatTitle: {
    flex: 1,
    color: customColors.onSurface,
    marginLeft: 8,
    fontWeight: '500',
  },
  statValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  horizontalStatValue: {
    color: customColors.onSurface,
    fontWeight: 'bold',
  },
  comparisonIcon: {
    margin: 0,
    marginLeft: 4,
  },
  // Summary card styles
  summaryCard: {
    marginHorizontal: 16,
    marginVertical: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: customColors.surfaceVariant,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    color: customColors.onSurfaceVariant,
    marginBottom: 4,
  },
  summaryValue: {
    color: customColors.onSurface,
    textAlign: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: customColors.outline,
  },
  // Connection surface styles (Settings page)
  connectionSurface: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: customColors.surfaceVariant,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  connectionTitle: {
    color: customColors.onSurface,
  },
  connectionStatus: {
    color: customColors.onSurfaceVariant,
    marginTop: 4,
  },
  connectionDivider: {
    marginVertical: 16,
    backgroundColor: customColors.outline,
  },
  connectionActions: {
    gap: 8,
  },
  connectionButton: {
    marginVertical: 4,
  },
  // Device selection styles
  deviceSelectionSection: {
    marginVertical: 8,
  },
  sectionTitle: {
    color: customColors.onSurface,
    marginBottom: 12,
    fontWeight: '600',
  },
  scanButton: {
    marginVertical: 8,
  },
  scanningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanningText: {
    color: customColors.primary,
    fontSize: 14,
  },
  dropdownContainer: {
    marginTop: 12,
  },
  dropdownLabel: {
    color: customColors.onSurfaceVariant,
    marginBottom: 8,
  },
  dropdownButton: {
    justifyContent: 'flex-start',
    borderColor: customColors.outline,
  },
  dropdownButtonContent: {
    justifyContent: 'flex-start',
    paddingVertical: 8,
  },
  menuContent: {
    backgroundColor: customColors.surfaceVariant,
    borderRadius: 8,
    marginTop: 8,
  },
  menuItem: {
    backgroundColor: 'transparent',
  },
  menuItemTitle: {
    color: customColors.onSurface,
  },
  // Feature surface styles (for Community and Settings)
  featureSurface: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    backgroundColor: customColors.surfaceVariant,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    color: customColors.onSurface,
    marginLeft: 12,
  },
  featureDivider: {
    marginVertical: 12,
    backgroundColor: customColors.outline,
  },
  featureDescription: {
    color: customColors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Feature card styles
  featureCard: {
    margin: 16,
    marginVertical: 6,
    backgroundColor: customColors.surfaceVariant,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    flex: 1,
    marginLeft: 8,
  },
  featureItemTitle: {
    color: customColors.onSurface,
    marginBottom: 4,
  },
  featureItemDesc: {
    color: customColors.onSurfaceVariant,
  },
});

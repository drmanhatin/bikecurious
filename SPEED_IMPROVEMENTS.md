# Speed Calculation Improvements

## Changes Made

### 1. **5-Second Speed Averaging**
- Added `speed_history` list to track speed readings over time
- Each speed calculation is timestamped and stored
- Old readings outside the 5-second window are automatically removed
- Final speed is the average of all readings within the 5-second window

### 2. **Speed Rounding Below 1 km/h**
- Any average speed below 1.0 km/h is rounded down to 0
- This eliminates small fluctuations when stationary or moving very slowly
- Provides cleaner speed readings in the menu bar

## Technical Implementation

```python
# Speed averaging over 5 seconds
self.speed_history = []  # List of (timestamp, speed) tuples
self.speed_window = 5.0  # 5 seconds

# Add current speed to history with timestamp
current_time = time.time()
if current_speed is not None:
    self.speed_history.append((current_time, current_speed))

# Remove old entries outside the 5-second window
cutoff_time = current_time - self.speed_window
self.speed_history = [(t, s) for t, s in self.speed_history if t >= cutoff_time]

# Calculate 5-second average speed
if self.speed_history:
    avg_speed = sum(speed for _, speed in self.speed_history) / len(self.speed_history)
    # Round anything below 1 km/h to 0
    speed_kmh = avg_speed if avg_speed >= 1.0 else 0.0
else:
    speed_kmh = 0.0
```

## Benefits

1. **Smoother Speed Display**: No more erratic speed jumps
2. **Better User Experience**: Speed readings are more stable and readable
3. **Eliminates Noise**: Small movements when stationary don't show as speed
4. **Realistic Readings**: Speed below 1 km/h is effectively zero for cycling

## Updated Daemon

The standalone py2app has been rebuilt with these improvements and is now running automatically.

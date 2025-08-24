#!/usr/bin/env python3
"""
Auto-connect to iConsole device
"""

import asyncio
from iconsole_reader import iConsoleDataReader

async def main():
    # Your iConsole device address from the scan
    device_address = "5F1372D5-7528-C321-9A48-87BA1DBA6FB9"
    
    print("🚴 iConsole Data Reader - Auto Connect")
    print("=" * 40)
    print(f"📱 Connecting to: iConsole+0462")
    print(f"🔗 Address: {device_address}")
    print(f"🚲 Wheel circumference: 1.0525m (~13\" wheel simulation)")
    print(f"📏 Distance calculations: wheel revolutions × {1.0525}m")
    print()
    
    # Create reader and connect
    reader = iConsoleDataReader(device_address)
    
    try:
        if await reader.connect():
            print("🚴 Ready to read data! Start pedaling on your bike...")
            print("Press Ctrl+C to stop")
            print()
            await reader.start_data_stream()
    except KeyboardInterrupt:
        print("\n⏹️  Stopping...")
    finally:
        await reader.disconnect()
        
        # Show summary
        if reader.data_log:
            print(f"\n📋 Captured {len(reader.data_log)} data packets")
            print("💾 Data logged for analysis")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")

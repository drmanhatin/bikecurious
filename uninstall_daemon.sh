#!/bin/bash
# Uninstall Helth Daemon Launch Agent

set -e

PLIST_FILE="com.helth.daemon.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "🗑️  Uninstalling Helth Daemon..."
echo "================================"

# Stop the service if it's running
if launchctl list | grep -q "com.helth.daemon"; then
    echo "⏹️  Stopping daemon..."
    launchctl stop com.helth.daemon
fi

# Unload the launch agent
if [ -f "$LAUNCH_AGENTS_DIR/$PLIST_FILE" ]; then
    echo "📤 Unloading launch agent..."
    launchctl unload "$LAUNCH_AGENTS_DIR/$PLIST_FILE"
    
    echo "🗂️  Removing plist file..."
    rm "$LAUNCH_AGENTS_DIR/$PLIST_FILE"
else
    echo "⚠️  Launch agent not found at $LAUNCH_AGENTS_DIR/$PLIST_FILE"
fi

echo "✅ Helth Daemon uninstalled successfully!"
echo ""
echo "📋 Note: Log files are preserved at:"
echo "   $HOME/Library/Logs/Helth/"
echo ""
echo "🔄 To reinstall, run: ./install_daemon.sh"

#!/bin/bash
# Install Helth Daemon as a Launch Agent

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_FILE="com.helth.daemon.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
DAEMON_SCRIPT="helth_daemon.py"

echo "🚴 Installing Helth Daemon..."
echo "================================"

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed or not in PATH"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "$SCRIPT_DIR/venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv "$SCRIPT_DIR/venv"
fi

# Install dependencies in virtual environment
echo "📦 Installing dependencies in virtual environment..."
"$SCRIPT_DIR/venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
"$SCRIPT_DIR/venv/bin/pip" install py2app

# Build standalone app if it doesn't exist or is older than the source
if [ ! -f "$SCRIPT_DIR/dist/Helth Daemon.app/Contents/MacOS/Helth Daemon" ] || [ "$SCRIPT_DIR/helth_daemon.py" -nt "$SCRIPT_DIR/dist/Helth Daemon.app/Contents/MacOS/Helth Daemon" ]; then
    echo "🔨 Building standalone app..."
    cd "$SCRIPT_DIR"
    "$SCRIPT_DIR/venv/bin/python" setup.py py2app --quiet
fi

# Make sure the daemon script is executable
chmod +x "$SCRIPT_DIR/$DAEMON_SCRIPT"

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCH_AGENTS_DIR"

# Create log directory
mkdir -p "$HOME/Library/Logs/Helth"

# Copy the plist file to LaunchAgents
cp "$SCRIPT_DIR/$PLIST_FILE" "$LAUNCH_AGENTS_DIR/"

# Load the launch agent
launchctl load "$LAUNCH_AGENTS_DIR/$PLIST_FILE"

echo "✅ Helth Daemon installed successfully!"
echo ""
echo "📋 Status:"
echo "  • Launch Agent: $LAUNCH_AGENTS_DIR/$PLIST_FILE"
echo "  • Daemon Script: $SCRIPT_DIR/$DAEMON_SCRIPT"
echo "  • Logs: $HOME/Library/Logs/Helth/"
echo ""
echo "🚀 The daemon will start automatically on login."
echo "   You can also start it manually with:"
echo "   launchctl start com.helth.daemon"
echo ""
echo "📱 Look for the bike icon (🚴) in your menu bar!"
echo ""
echo "🔧 To uninstall, run: ./uninstall_daemon.sh"

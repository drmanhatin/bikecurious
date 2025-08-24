#!/bin/bash
# Helth Daemon Wrapper Script
# Runs the Python daemon without showing in dock

cd "$(dirname "$0")"

# Set environment to hide from dock
export PYTHONDONTWRITEBYTECODE=1

# Run the daemon with the virtual environment Python
exec ./venv/bin/python helth_daemon.py

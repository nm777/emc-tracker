#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node &> /dev/null; then
  echo "Node.js is not installed."
  echo "Please install it from https://nodejs.org (download the LTS version)"
  echo "Then run this script again."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Node.js version $(node -v) is too old. Please update to version 18 or newer."
  echo "Download it from https://nodejs.org"
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

node server.js &
SERVER_PID=$!

sleep 2

if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "Failed to start the server. Check for errors above."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

echo ""
echo "EMC Tracker is running at http://localhost:3000"
echo "This window must stay open while the app is running."
echo "Press Ctrl+C to stop the server."
echo ""

open http://localhost:3000 2>/dev/null || echo "Open your browser and go to: http://localhost:3000"

wait $SERVER_PID

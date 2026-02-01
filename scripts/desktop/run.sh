#!/bin/bash
# Quick start script for Amphibian Desktop
# Runs directly with Node.js (no build required)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$SCRIPT_DIR/../.."
DESKTOP_DIR="$ROOT_DIR/desktop"

cd "$DESKTOP_DIR"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run the desktop client
echo "🐸 Starting Amphibian Desktop..."
node main.js "$@"

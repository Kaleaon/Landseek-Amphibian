#!/bin/bash
set -e

# Bundle bridge code into Android assets
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BRIDGE_SRC="$PROJECT_ROOT/bridge"
ASSETS_DIR="$PROJECT_ROOT/android/app/src/main/assets/bridge"

echo "🐸 Landseek-Amphibian Bridge Bundler"
echo "===================================="
echo "Source: $BRIDGE_SRC"
echo "Target: $ASSETS_DIR"
echo ""

# Clean and create target directory
rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"

# Copy JavaScript files
echo "📦 Copying bridge files..."

# Main files
cp "$BRIDGE_SRC/server.js" "$ASSETS_DIR/"
cp "$BRIDGE_SRC/mcp_host.js" "$ASSETS_DIR/"
cp "$BRIDGE_SRC/android_mcp.js" "$ASSETS_DIR/"
cp "$BRIDGE_SRC/package.json" "$ASSETS_DIR/"

# Brains directory
mkdir -p "$ASSETS_DIR/brains"
cp "$BRIDGE_SRC/brains/"*.js "$ASSETS_DIR/brains/"

# Commands directory
mkdir -p "$ASSETS_DIR/commands"
cp "$BRIDGE_SRC/commands/"*.js "$ASSETS_DIR/commands/"

# Documents directory
mkdir -p "$ASSETS_DIR/documents"
cp "$BRIDGE_SRC/documents/"*.js "$ASSETS_DIR/documents/"

# Personalities directory
mkdir -p "$ASSETS_DIR/personalities"
cp "$BRIDGE_SRC/personalities/"*.js "$ASSETS_DIR/personalities/"

# P2P directory
mkdir -p "$ASSETS_DIR/p2p"
cp "$BRIDGE_SRC/p2p/"*.js "$ASSETS_DIR/p2p/"

# MCP Servers directory (if exists)
if [ -d "$BRIDGE_SRC/mcp_servers" ]; then
    mkdir -p "$ASSETS_DIR/mcp_servers"
    cp -r "$BRIDGE_SRC/mcp_servers/"* "$ASSETS_DIR/mcp_servers/" 2>/dev/null || true
fi

# Install and bundle node_modules (production only)
echo ""
echo "📦 Installing production dependencies..."
cd "$BRIDGE_SRC"
npm install --production --ignore-scripts 2>/dev/null || {
    echo "⚠️  npm install failed, continuing without node_modules..."
}

if [ -d "node_modules" ]; then
    echo "📦 Bundling node_modules..."
    cp -r node_modules "$ASSETS_DIR/"
    
    # Remove unnecessary files from node_modules to reduce size
    find "$ASSETS_DIR/node_modules" -name "*.md" -delete 2>/dev/null || true
    find "$ASSETS_DIR/node_modules" -name "*.txt" -delete 2>/dev/null || true
    find "$ASSETS_DIR/node_modules" -name "LICENSE*" -delete 2>/dev/null || true
    find "$ASSETS_DIR/node_modules" -name "CHANGELOG*" -delete 2>/dev/null || true
    find "$ASSETS_DIR/node_modules" -name ".npmignore" -delete 2>/dev/null || true
    find "$ASSETS_DIR/node_modules" -name ".travis.yml" -delete 2>/dev/null || true
    find "$ASSETS_DIR/node_modules" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
    find "$ASSETS_DIR/node_modules" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
    find "$ASSETS_DIR/node_modules" -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true
fi

cd "$PROJECT_ROOT"

# Create version file
VERSION=$(date +"%Y%m%d.%H%M%S")
echo "$VERSION" > "$ASSETS_DIR/.version"

# Calculate total size
TOTAL_SIZE=$(du -sh "$ASSETS_DIR" | cut -f1)

echo ""
echo "✅ Bridge bundled successfully!"
echo "   Version: $VERSION"
echo "   Total size: $TOTAL_SIZE"
echo ""
echo "📋 Contents:"
find "$ASSETS_DIR" -type f -name "*.js" | head -20
echo ""
echo "Next step: cd android && ./gradlew assembleDebug"

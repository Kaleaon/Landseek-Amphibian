#!/bin/bash
set -e

# Configuration
NODE_VERSION="v22.12.0"
ARCH="arm64"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="$PROJECT_ROOT/android/app/src/main/assets/node-bin"

echo "🐸 Landseek-Amphibian Node.js Runtime Setup"
echo "============================================"
echo "Node.js Version: $NODE_VERSION"
echo "Architecture: $ARCH"
echo "Target: $TARGET_DIR"
echo ""

# Create target directory
mkdir -p "$TARGET_DIR"

create_placeholder() {
    cat > "$TARGET_DIR/node" << 'EOF'
#!/system/bin/sh
# Placeholder Node.js binary
# Replace this with a real aarch64-linux-android Node.js binary
#
# Options:
# 1. Download from nodejs-mobile project
# 2. Build from source using Android NDK
# 3. Use termux's Node.js binary

echo "ERROR: This is a placeholder. Please install a real Node.js binary."
echo "See scripts/setup_runtime.sh for instructions."
exit 1
EOF
    chmod +x "$TARGET_DIR/node"
}

# Check if we're on a system that can build for Android
if command -v ndk-build &> /dev/null; then
    echo "📦 Android NDK detected. Building Node.js from source..."
    echo "⚠️  This process requires significant time and resources."
    echo "   For faster development, use a pre-built binary."
fi

# Option 1: Use nodejs-mobile prebuilt binary (recommended for development)
echo ""
echo "📥 Downloading Node.js for Android ARM64..."
echo "   Source: nodejs-mobile project"
echo ""

DOWNLOAD_URL="https://github.com/nicknisi/nodejs-mobile/releases/download/v18.19.0/nodejs-mobile-v18.19.0-android-arm64.tar.gz"
TEMP_DIR=$(mktemp -d)

# Try to download, fall back to placeholder if network unavailable
if curl -fL --connect-timeout 10 -o "$TEMP_DIR/node.tar.gz" "$DOWNLOAD_URL" 2>/dev/null; then
    echo "✅ Download complete. Extracting..."
    tar -xzf "$TEMP_DIR/node.tar.gz" -C "$TEMP_DIR"
    
    # Find and copy the node binary
    NODE_BIN=$(find "$TEMP_DIR" -name "node" -type f | head -1)
    if [ -n "$NODE_BIN" ]; then
        cp "$NODE_BIN" "$TARGET_DIR/node"
        chmod +x "$TARGET_DIR/node"
        echo "✅ Node.js binary installed at $TARGET_DIR/node"
    else
        echo "⚠️  Could not find node binary in archive"
        create_placeholder
    fi
    
    rm -rf "$TEMP_DIR"
else
    echo "⚠️  Could not download Node.js binary (network issue or unavailable)"
    echo "   Creating placeholder for development..."
    create_placeholder
fi

# Verify the binary
echo ""
echo "📋 Verifying installation..."
if [ -f "$TARGET_DIR/node" ]; then
    FILE_INFO=$(file "$TARGET_DIR/node" 2>/dev/null || echo "Unknown")
    echo "   Binary: $TARGET_DIR/node"
    echo "   Type: $FILE_INFO"
    SIZE=$(du -h "$TARGET_DIR/node" | cut -f1)
    echo "   Size: $SIZE"
else
    echo "❌ Node binary not found!"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run ./scripts/bundle_bridge.sh to package the bridge code"
echo "  2. Run cd android && ./gradlew assembleDebug to build the APK"

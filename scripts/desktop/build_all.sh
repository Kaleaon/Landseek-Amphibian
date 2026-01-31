#!/bin/bash
# Build Amphibian Desktop for all platforms
# Outputs: dist/amphibian-win.exe, dist/amphibian-linux, dist/amphibian-macos

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$SCRIPT_DIR/../.."
DESKTOP_DIR="$ROOT_DIR/desktop"

echo "🔨 Building Amphibian Desktop..."
echo "================================"

cd "$DESKTOP_DIR"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create dist directory
mkdir -p dist

# Build for Windows
echo "🪟 Building for Windows..."
npm run build:win || echo "⚠️ Windows build failed (may need Windows environment)"

# Build for Linux
echo "🐧 Building for Linux..."
npm run build:linux || echo "⚠️ Linux build failed"

# Build for macOS
echo "🍎 Building for macOS..."
npm run build:mac || echo "⚠️ macOS build failed (may need macOS environment)"

echo ""
echo "✅ Build complete!"
echo "==================="
echo "Outputs:"
ls -la dist/ 2>/dev/null || echo "No binaries built yet"

echo ""
echo "📝 Notes:"
echo "- Windows .exe may require Windows environment to build"
echo "- macOS binary may require macOS environment to sign"
echo "- Linux binary should work on most x64 distributions"

#!/bin/bash
set -e

# Build release APK for Landseek-Amphibian
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🐸 Landseek-Amphibian Release Build"
echo "===================================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v java &> /dev/null; then
    echo "❌ Java not found. Please install JDK 17+."
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
    echo "❌ Java 17+ required. Found: $JAVA_VERSION"
    exit 1
fi
echo "✅ Java $JAVA_VERSION"

# Step 1: Setup Node.js runtime
echo ""
echo "📦 Step 1: Setting up Node.js runtime..."
"$SCRIPT_DIR/setup_runtime.sh"

# Step 2: Bundle bridge code
echo ""
echo "📦 Step 2: Bundling bridge code..."
"$SCRIPT_DIR/bundle_bridge.sh"

# Step 3: Build APK
echo ""
echo "🔨 Step 3: Building release APK..."
cd "$PROJECT_ROOT/android"

# Check for gradlew
if [ ! -f "gradlew" ]; then
    echo "📥 Downloading Gradle wrapper..."
    gradle wrapper --gradle-version 8.5
fi

chmod +x gradlew

# Build release APK
./gradlew assembleRelease --no-daemon

# Find the APK
APK_PATH=$(find . -name "*.apk" -path "*/release/*" | head -1)

if [ -n "$APK_PATH" ]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    echo ""
    echo "🎉 Build successful!"
    echo "   APK: $APK_PATH"
    echo "   Size: $APK_SIZE"
    echo ""
    echo "📱 Install with: adb install $APK_PATH"
else
    echo ""
    echo "⚠️  Build completed but APK not found in expected location."
    echo "   Check android/app/build/outputs/apk/release/"
fi

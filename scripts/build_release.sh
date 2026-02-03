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

JDK_DIR="$PROJECT_ROOT/.jdk/temurin-17"
JAVA_BIN="java"

download_jdk() {
    local os arch url archive temp_dir

    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "$arch" in
        x86_64) arch="x64" ;;
        aarch64 | arm64) arch="aarch64" ;;
    esac

    case "$os" in
        linux | darwin) ;;
        *)
            echo "❌ Unsupported OS for auto JDK install: $os"
            exit 1
            ;;
    esac

    mkdir -p "$JDK_DIR"
    temp_dir=$(mktemp -d)
    archive="$temp_dir/jdk.tar.gz"
    url="https://api.adoptium.net/v3/binary/latest/17/ga/${os}/${arch}/jdk/hotspot/normal/eclipse"

    echo "📥 Downloading Temurin JDK 17 from Adoptium..."
    if ! curl -f -L --connect-timeout 10 -H "User-Agent: landseek-build" -o "$archive" "$url"; then
        echo "❌ Failed to download JDK 17."
        rm -rf "$temp_dir"
        exit 1
    fi

    tar -xzf "$archive" -C "$JDK_DIR"
    rm -rf "$temp_dir"

    JAVA_HOME=$(find "$JDK_DIR" -maxdepth 1 -type d -name "jdk*" | head -1)
    if [ -z "$JAVA_HOME" ]; then
        echo "❌ Unable to locate extracted JDK in $JDK_DIR"
        exit 1
    fi

    export JAVA_HOME
    export PATH="$JAVA_HOME/bin:$PATH"
    JAVA_BIN="$JAVA_HOME/bin/java"
}

if ! command -v java &> /dev/null; then
    echo "⚠️  Java not found. Installing JDK 17 locally..."
    download_jdk
fi

JAVA_VERSION=$("$JAVA_BIN" -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ] || [ "$JAVA_VERSION" -gt 21 ]; then
    echo "⚠️  Java $JAVA_VERSION is unsupported by the Android Gradle plugin."
    echo "   Installing JDK 17 locally..."
    download_jdk
    JAVA_VERSION=$("$JAVA_BIN" -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
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

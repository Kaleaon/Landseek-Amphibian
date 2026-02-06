#!/bin/bash
# Landseek-Amphibian Build Script
# Builds self-contained executables for distribution.
#
# Usage:
#   ./build.sh                  Build for current platform
#   ./build.sh linux            Build Linux x64 binary
#   ./build.sh win              Build Windows x64 .exe
#   ./build.sh mac              Build macOS x64 binary
#   ./build.sh all              Build all desktop platforms
#   ./build.sh android          Build Android APK (requires Android SDK)

set -e

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DESKTOP_DIR="$ROOT_DIR/desktop"
ANDROID_DIR="$ROOT_DIR/android"
DIST_DIR="$DESKTOP_DIR/dist"

TARGET="${1:-current}"

echo ""
echo "  Landseek-Amphibian Build"
echo "  ========================"
echo ""

# ── Ensure dependencies ───────────────────────────────────

echo "  Installing dependencies..."
cd "$ROOT_DIR/bridge" && npm install --silent 2>&1 | tail -1
cd "$DESKTOP_DIR" && npm install --silent 2>&1 | tail -1
mkdir -p "$DIST_DIR"

# ── Desktop Build Functions ────────────────────────────────

build_linux() {
    echo "  Building Linux x64..."
    cd "$DESKTOP_DIR"
    npx pkg . --targets node18-linux-x64 --output "$DIST_DIR/amphibian-linux" 2>&1 | grep -v "^>" || true
    if [ -f "$DIST_DIR/amphibian-linux" ]; then
        SIZE=$(du -h "$DIST_DIR/amphibian-linux" | cut -f1)
        echo "  Built: dist/amphibian-linux ($SIZE)"
    else
        echo "  ERROR: Linux build failed"
        return 1
    fi
}

build_win() {
    echo "  Building Windows x64..."
    cd "$DESKTOP_DIR"
    npx pkg . --targets node18-win-x64 --output "$DIST_DIR/amphibian-win.exe" 2>&1 | grep -v "^>" || true
    if [ -f "$DIST_DIR/amphibian-win.exe" ]; then
        SIZE=$(du -h "$DIST_DIR/amphibian-win.exe" | cut -f1)
        echo "  Built: dist/amphibian-win.exe ($SIZE)"
    else
        echo "  ERROR: Windows build failed"
        return 1
    fi
}

build_mac() {
    echo "  Building macOS x64..."
    cd "$DESKTOP_DIR"
    npx pkg . --targets node18-macos-x64 --output "$DIST_DIR/amphibian-macos" 2>&1 | grep -v "^>" || true
    if [ -f "$DIST_DIR/amphibian-macos" ]; then
        SIZE=$(du -h "$DIST_DIR/amphibian-macos" | cut -f1)
        echo "  Built: dist/amphibian-macos ($SIZE)"
    else
        echo "  ERROR: macOS build failed"
        return 1
    fi
}

build_android() {
    echo "  Building Android APK..."

    if [ ! -d "$ANDROID_DIR" ]; then
        echo "  ERROR: android/ directory not found"
        return 1
    fi

    # Check for Android SDK
    if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
        echo "  ERROR: Android SDK not found."
        echo ""
        echo "  Set ANDROID_HOME or ANDROID_SDK_ROOT environment variable."
        echo "  Install Android SDK: https://developer.android.com/studio"
        echo "  Or use sdkmanager:"
        echo "    sdkmanager 'platforms;android-34' 'build-tools;34.0.0'"
        echo ""
        return 1
    fi

    # Bundle bridge code into APK assets
    if [ -f "$ROOT_DIR/scripts/bundle_bridge.sh" ]; then
        echo "  Bundling bridge code..."
        bash "$ROOT_DIR/scripts/bundle_bridge.sh"
    fi

    cd "$ANDROID_DIR"
    chmod +x gradlew 2>/dev/null || true

    echo "  Running Gradle build..."
    ./gradlew assembleRelease --no-daemon 2>&1

    APK_PATH=$(find . -name "*.apk" -path "*/release/*" 2>/dev/null | head -1)

    if [ -n "$APK_PATH" ]; then
        SIZE=$(du -h "$APK_PATH" | cut -f1)
        echo "  Built: $APK_PATH ($SIZE)"
        echo "  Install with: adb install $APK_PATH"
    else
        echo "  Build completed but APK not found. Check android/app/build/outputs/"
    fi
}

# ── Build ──────────────────────────────────────────────────

case "$TARGET" in
    linux)
        build_linux
        ;;
    win|windows)
        build_win
        ;;
    mac|macos)
        build_mac
        ;;
    android|apk)
        build_android
        ;;
    all)
        build_linux
        build_win
        build_mac
        echo ""
        echo "  All desktop builds complete."
        echo "  For Android, run: ./build.sh android"
        ;;
    current)
        case "$(uname -s)" in
            Linux*)  build_linux ;;
            Darwin*) build_mac ;;
            MINGW*|MSYS*|CYGWIN*) build_win ;;
            *) echo "  Unknown platform. Specify: linux, win, mac, or all" ;;
        esac
        ;;
    *)
        echo "  Usage: ./build.sh [linux|win|mac|android|all]"
        exit 1
        ;;
esac

echo ""
echo "  Build output: $DIST_DIR/"
ls -la "$DIST_DIR/" 2>/dev/null | grep -v "^total" | grep -v "^d"
echo ""
echo "  The binary is self-contained. Copy it anywhere and run."
echo "  It requires Ollama on the target machine for AI chat."
echo "  Edit mcp.json in the working directory to configure MCP tools."
echo ""

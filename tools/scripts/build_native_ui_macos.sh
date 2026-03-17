#!/bin/bash
# Build script for macOS SwiftUI mining dashboard

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/../../apps/native/mining-ui/macos-swiftui"

CONFIG="Release"
CLEAN=false
CREATE_DMG=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            CONFIG="Debug"
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        --dmg)
            CREATE_DMG=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "Building KuberCoin Miner for macOS..."

if [ ! -d "$PROJECT_DIR" ]; then
    echo "Error: Project directory not found: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

# Check Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo "Error: Xcode command line tools not found"
    echo "Install with: xcode-select --install"
    exit 1
fi

if [ "$CLEAN" = true ]; then
    echo "Cleaning previous builds..."
    rm -rf build
    rm -rf DerivedData
    rm -f *.dmg
fi

echo "Building project..."
xcodebuild -project KuberCoinMiner.xcodeproj \
    -scheme KuberCoinMiner \
    -configuration $CONFIG \
    -derivedDataPath ./build \
    build

APP_PATH="build/Build/Products/$CONFIG/KuberCoinMiner.app"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: Build failed - app bundle not found"
    exit 1
fi

echo ""
echo "✅ Build completed successfully!"
echo "App location: $APP_PATH"

# Get app size
APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
echo "App size: $APP_SIZE"

if [ "$CREATE_DMG" = true ]; then
    echo ""
    echo "Creating DMG..."

    DMG_NAME="KuberCoinMiner"

    # Clean up old DMG
    rm -f "${DMG_NAME}.dmg"

    # Create temporary directory for DMG contents
    mkdir -p dmg_temp
    cp -R "$APP_PATH" dmg_temp/

    # Create DMG
    hdiutil create -volname "$DMG_NAME" \
        -srcfolder dmg_temp \
        -ov -format UDZO \
        "${DMG_NAME}.dmg"

    rm -rf dmg_temp

    DMG_SIZE=$(du -h "${DMG_NAME}.dmg" | cut -f1)
    echo "✅ DMG created: ${DMG_NAME}.dmg"
    echo "DMG size: $DMG_SIZE"
fi

echo ""
echo "To run:"
echo "  export KUBERCOIN_RPC_URL='http://127.0.0.1:8634'"
echo "  export KUBERCOIN_API_KEY='your_api_key_here'"
echo "  open $APP_PATH"

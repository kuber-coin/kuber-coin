#!/bin/bash
# Build script for Linux GTK4 mining dashboard

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/../../apps/native/mining-ui/linux-gtk4"

CONFIG="release"
CLEAN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            CONFIG="debug"
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "Building KuberCoin Miner for Linux..."

if [ ! -d "$PROJECT_DIR" ]; then
    echo "Error: Project directory not found: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

# Check dependencies
echo "Checking dependencies..."
if ! pkg-config --exists gtk4; then
    echo "Error: GTK4 not found. Install with:"
    echo "  Ubuntu/Debian: sudo apt install libgtk-4-dev libadwaita-1-dev"
    echo "  Fedora: sudo dnf install gtk4-devel libadwaita-devel"
    echo "  Arch: sudo pacman -S gtk4 libadwaita"
    exit 1
fi

if [ "$CLEAN" = true ]; then
    echo "Cleaning previous builds..."
    cargo clean
fi

echo "Building project..."
if [ "$CONFIG" = "release" ]; then
    cargo build --release
    BINARY_PATH="target/release/kubercoin-miner-gtk"
else
    cargo build
    BINARY_PATH="target/debug/kubercoin-miner-gtk"
fi

echo ""
echo "✅ Build completed successfully!"
echo "Binary location: $BINARY_PATH"

if [ -f "$BINARY_PATH" ]; then
    SIZE=$(du -h "$BINARY_PATH" | cut -f1)
    echo "Binary size: $SIZE"

    # Strip symbols in release mode
    if [ "$CONFIG" = "release" ]; then
        echo "Stripping debug symbols..."
        strip "$BINARY_PATH"
        SIZE_STRIPPED=$(du -h "$BINARY_PATH" | cut -f1)
        echo "Stripped size: $SIZE_STRIPPED"
    fi
fi

echo ""
echo "To run:"
echo "  export KUBERCOIN_RPC_URL='http://127.0.0.1:8634'"
echo "  export KUBERCOIN_API_KEY='your_api_key_here'"
echo "  ./$BINARY_PATH"

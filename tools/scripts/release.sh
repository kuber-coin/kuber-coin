#!/usr/bin/env bash
# scripts/release.sh — build a release binary and generate a SHA-256 checksum.
#
# Usage:
#   ./scripts/release.sh [TARGET]
#
# Examples:
#   ./scripts/release.sh                    # native host target
#   ./scripts/release.sh x86_64-unknown-linux-musl
#
# Outputs (under target/release/ or target/<TARGET>/release/):
#   kubercoin          — the stripped release binary
#   kubercoin.sha256   — SHA-256 checksum file (sha256sum-compatible)
#   kubercoin.version  — git describe output (version string)

set -euo pipefail

TARGET="${1:-}"

echo "==> Building Kubercoin release binary"
if [[ -n "$TARGET" ]]; then
    cargo build --release -p node --target "$TARGET"
    BINARY_DIR="target/${TARGET}/release"
else
    cargo build --release -p node
    BINARY_DIR="target/release"
fi

BINARY="${BINARY_DIR}/kubercoin"

if [[ ! -f "$BINARY" ]]; then
    echo "ERROR: expected binary not found at $BINARY" >&2
    exit 1
fi

# Strip debug symbols to reduce binary size (ignore if strip is unavailable)
if command -v strip &>/dev/null; then
    echo "==> Stripping debug symbols"
    strip "$BINARY"
fi

# Record version string
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "unknown")
echo "$VERSION" > "${BINARY}.version"
echo "==> Version: $VERSION"

# Generate checksum
echo "==> Generating SHA-256 checksum"
if command -v sha256sum &>/dev/null; then
    sha256sum "$BINARY" > "${BINARY}.sha256"
elif command -v shasum &>/dev/null; then
    shasum -a 256 "$BINARY" > "${BINARY}.sha256"
else
    echo "ERROR: neither sha256sum nor shasum found; cannot generate checksum" >&2
    exit 1
fi

cat "${BINARY}.sha256"

echo ""
echo "==> Release artifacts:"
echo "    Binary:   $BINARY"
echo "    Checksum: ${BINARY}.sha256"
echo "    Version:  ${BINARY}.version"
echo ""
echo "    Verify with:"
echo "      sha256sum -c ${BINARY}.sha256"

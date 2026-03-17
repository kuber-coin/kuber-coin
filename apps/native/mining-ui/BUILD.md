# Native Mining UI Build Documentation

This document describes how to build the native mining dashboards for all platforms.

## Quick Start

### Build Current Platform

```bash
# PowerShell (any platform)
./scripts/build_all_native_ui.ps1

# Or platform-specific
./scripts/build_native_ui_windows.ps1  # Windows
./scripts/build_native_ui_linux.sh     # Linux
./scripts/build_native_ui_macos.sh     # macOS
```

## Platform-Specific Instructions

### Windows (WinUI 3)

**Requirements:**

- Windows 10 version 1809 or later / Windows 11
- .NET 8.0 SDK
- Windows App SDK 1.5

**Build:**

```powershell
cd scripts
.\build_native_ui_windows.ps1

# Options:
.\build_native_ui_windows.ps1 -Configuration Release
.\build_native_ui_windows.ps1 -Clean
.\build_native_ui_windows.ps1 -Runtime win-arm64  # For ARM64
```

**Output:**

- Location: `native-mining-ui/windows-winui3/publish/`
- Binary: `KuberCoinMiner.exe`
- Size: ~8-12 MB (self-contained)

**Manual Build:**

```powershell
cd native-mining-ui/windows-winui3
dotnet restore
dotnet build --configuration Release
dotnet publish -c Release -o ./publish --self-contained true -r win-x64
```

### Linux (GTK4)

**Requirements:**

- GTK4 >= 4.10
- libadwaita >= 1.3
- cairo, pango
- Rust toolchain

**Install Dependencies:**

```bash
# Ubuntu/Debian
sudo apt install libgtk-4-dev libadwaita-1-dev libcairo2-dev pkg-config

# Fedora
sudo dnf install gtk4-devel libadwaita-devel cairo-devel

# Arch Linux
sudo pacman -S gtk4 libadwaita cairo
```

**Build:**

```bash
cd scripts
chmod +x build_native_ui_linux.sh
./build_native_ui_linux.sh

# Options:
./build_native_ui_linux.sh --clean
./build_native_ui_linux.sh --debug
```

**Output:**

- Location: `native-mining-ui/linux-gtk4/target/release/`
- Binary: `kubercoin-miner-gtk`
- Size: ~4-6 MB (stripped)

**Manual Build:**

```bash
cd native-mining-ui/linux-gtk4
cargo build --release
strip target/release/kubercoin-miner-gtk  # Optional: reduce size
```

### macOS (SwiftUI)

**Requirements:**

- macOS 13.0 (Ventura) or later
- Xcode 15.0 or later
- Command Line Tools

**Build:**

```bash
cd scripts
chmod +x build_native_ui_macos.sh
./build_native_ui_macos.sh

# Options:
./build_native_ui_macos.sh --clean
./build_native_ui_macos.sh --dmg       # Create DMG installer
./build_native_ui_macos.sh --debug
```

**Output:**

- Location: `native-mining-ui/macos-swiftui/build/Build/Products/Release/`
- Bundle: `KuberCoinMiner.app`
- Size: ~3-5 MB

**Manual Build:**

```bash
cd native-mining-ui/macos-swiftui
xcodebuild -project KuberCoinMiner.xcodeproj \
    -scheme KuberCoinMiner \
    -configuration Release \
    build
```

**Create DMG:**

```bash
hdiutil create -volname "KuberCoin Miner" \
    -srcfolder build/Build/Products/Release/KuberCoinMiner.app \
    -ov -format UDZO \
    KuberCoinMiner.dmg
```

## Cross-Platform Build (CI/CD)

The GitHub Actions workflow automatically builds all platforms:

```yaml
# Trigger manually
gh workflow run build-native-ui.yml

# Or push to trigger
git push origin main
```

Artifacts are uploaded for each platform:

- `kubercoin-miner-windows-x64.zip`
- `kubercoin-miner-linux-x64.tar.gz`
- `kubercoin-miner-macos-universal.dmg`

## Build Options

### Clean Build

Removes all previous build artifacts:

```powershell
# Windows
.\build_native_ui_windows.ps1 -Clean

# Linux
./build_native_ui_linux.sh --clean

# macOS
./build_native_ui_macos.sh --clean
```

### Debug Build

Build with debug symbols for development:

```bash
# Linux
./build_native_ui_linux.sh --debug

# macOS
./build_native_ui_macos.sh --debug
```

### Package for Distribution

```powershell
# Windows - Already creates self-contained executable
.\build_native_ui_windows.ps1

# Linux - Create AppImage (requires appimagetool)
cd native-mining-ui/linux-gtk4
appimagetool AppDir KuberCoinMiner.AppImage

# macOS - Create DMG
./build_native_ui_macos.sh --dmg
```

## Troubleshooting

### Windows

**Error: Windows App SDK not found**

```powershell
dotnet workload install windows
```

**Error: Missing WinUI dependencies**

```powershell
# Repair Visual Studio with Windows App SDK components
```

### Linux

**Error: gtk4 not found**

```bash
# Check installation
pkg-config --modversion gtk4

# If not found, install dependencies
sudo apt install libgtk-4-dev
```

**Error: Cannot find -ladwaita**

```bash
sudo apt install libadwaita-1-dev
```

### macOS

**Error: xcodebuild not found**

```bash
xcode-select --install
```

**Error: Code signing required**

```bash
# Build without signing (development only)
xcodebuild -project KuberCoinMiner.xcodeproj \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO
```

## Binary Sizes

| Platform | Framework | Uncompressed | Compressed |
| -------- | --------- | ------------ | ---------- |
| Windows  | WinUI 3   | 8-12 MB      | 3-4 MB     |
| Linux    | GTK4      | 4-6 MB       | 2-3 MB     |
| macOS    | SwiftUI   | 3-5 MB       | 1-2 MB     |

## Performance Optimization

### Windows

```xml
<!-- KuberCoinMiner.csproj -->
<PropertyGroup>
  <PublishTrimmed>true</PublishTrimmed>
  <PublishReadyToRun>true</PublishReadyToRun>
</PropertyGroup>
```

### Linux

```toml
# Cargo.toml
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
```

### macOS

```bash
# Strip debug symbols
xcrun strip -x KuberCoinMiner.app/Contents/MacOS/KuberCoinMiner
```

## Development Workflow

### Hot Reload

**Windows:**

```powershell
dotnet watch run
```

**Linux:**

```bash
cargo watch -x run
```

**macOS:**
Use Xcode's built-in hot reload (SwiftUI Previews)

### Run Tests

```bash
# Windows
cd native-mining-ui/windows-winui3
dotnet test

# Linux
cd native-mining-ui/linux-gtk4
cargo test

# macOS
cd native-mining-ui/macos-swiftui
xcodebuild test -project KuberCoinMiner.xcodeproj -scheme KuberCoinMiner
```

## Distribution

### Windows

- **MSIX Package**: Use Visual Studio Package Project
- **Installer**: Use WiX Toolset
- **Store**: Submit to Microsoft Store

### Linux

- **.deb package**: Use `dpkg-deb`
- **.rpm package**: Use `rpmbuild`
- **Flatpak**: Create flatpak manifest
- **AppImage**: Bundle with dependencies

### macOS

- **DMG**: Created by build script with `--dmg`
- **Notarization**: Required for distribution outside App Store
- **App Store**: Submit via App Store Connect

## Environment Variables

All platforms support these environment variables:

```bash
export KUBERCOIN_RPC_URL="http://127.0.0.1:8332"
export KUBERCOIN_API_KEY="your_api_key_here"
```

## Next Steps

After building:

1. **Test the application**: Run and verify all features work
2. **Package for distribution**: Create installers for each platform
3. **Sign binaries**: Code sign for production release
4. **Submit to stores**: Optional distribution via app stores
5. **Create documentation**: User guides and release notes

## Support

For build issues:

- Check platform-specific README in each UI directory
- Review GitHub Actions logs for CI builds
- Open an issue with build output

---

**Remember**: Always test on actual target platforms before release!

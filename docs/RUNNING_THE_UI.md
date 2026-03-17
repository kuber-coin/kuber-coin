# Running the KuberCoin Native Mining UI

## Quick Demo

A static PowerShell demo is available to preview the UI design:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\demo_ui_simple.ps1
```

This shows the dashboard layout with simulated mining data.

## Building the Actual Native UIs

### Windows (WinUI 3)

**Requirements:**
- .NET 8.0 SDK or later
- Windows 10 version 1809 (build 17763) or later
- Windows 11 recommended for best experience

**Install .NET SDK:**

Option 1 - Direct Download:
1. Go to https://dotnet.microsoft.com/download/dotnet/8.0
2. Download ".NET 8.0 SDK (v8.0.x)" for Windows x64
3. Run the installer

Option 2 - winget (if available):
```powershell
winget install Microsoft.DotNet.SDK.8
```

Option 3 - Chocolatey:
```powershell
choco install dotnet-8.0-sdk
```

**Build:**
```powershell
cd native-mining-ui\windows-winui3
dotnet restore
dotnet build --configuration Release
```

**Run:**
```powershell
dotnet run --configuration Release
```

Or use the automated build script:
```powershell
.\scripts\build_native_ui_windows.ps1 -Configuration Release
```

The executable will be in: `native-mining-ui\windows-winui3\bin\Release\net8.0-windows10.0.19041.0\win-x64\`

---

### Linux (GTK4)

**Requirements:**
- Rust 1.70+ and Cargo
- GTK4 development libraries
- Libadwaita development libraries

**Install Dependencies:**

Ubuntu/Debian:
```bash
sudo apt install libgtk-4-dev libadwaita-1-dev build-essential
```

Fedora:
```bash
sudo dnf install gtk4-devel libadwaita-devel gcc
```

Arch:
```bash
sudo pacman -S gtk4 libadwaita base-devel
```

**Build:**
```bash
cd native-mining-ui/linux-gtk4
cargo build --release
```

**Run:**
```bash
cargo run --release
```

Or use the automated script:
```bash
./scripts/build_native_ui_linux.sh --release
```

The executable will be in: `native-mining-ui/linux-gtk4/target/release/kubercoin-miner-gtk`

---

### macOS (SwiftUI)

**Requirements:**
- macOS 13.0 (Ventura) or later
- Xcode 14.0 or later
- Command Line Tools for Xcode

**Install Xcode:**
1. Open App Store
2. Search for "Xcode"
3. Install Xcode
4. Open Xcode and agree to license

**Build:**
```bash
cd native-mining-ui/macos-swiftui
xcodebuild -scheme KuberCoinMiner -configuration Release build
```

**Run:**
```bash
xcodebuild -scheme KuberCoinMiner -configuration Release build
open build/Release/KuberCoinMiner.app
```

Or use the automated script:
```bash
./scripts/build_native_ui_macos.sh --release --dmg
```

The app bundle will be in: `native-mining-ui/macos-swiftui/build/Release/KuberCoinMiner.app`

---

## Features

All three native UIs include:

### Dashboard
- Real-time mining status and hashrate
- Daily/weekly/all-time earnings
- Active device count and summary
- Pool connection status

### Devices Management
- Per-device monitoring (hashrate, temperature, power, fan speed)
- Enable/disable individual GPUs
- Device health indicators
- Performance graphs

### GPU Overclocking
- Core clock adjustment (-200 to +300 MHz)
- Memory clock adjustment (-500 to +1000 MHz)
- Power limit control (50% to 120%)
- Fan speed override (0% to 100%)
- Temperature target settings
- Safety warnings and limits

### Pool Switching
- Multiple pool configurations
- Auto-failover settings
- Pool latency monitoring
- Balance display per pool
- Quick pool switching

### Performance Charts
- Hashrate history (24h, 7d, 30d)
- Temperature trends
- Power consumption graphs
- Earnings over time
- Interactive charts with zoom/pan

### Alert System
- Configurable alert rules:
  - Temperature thresholds
  - Hashrate drops
  - Device failures
  - Pool disconnections
- Email/desktop notifications
- Alert history log
- Rule management

---

## Connecting to KuberCoin Node

The UIs connect to a running KuberCoin node via JSON-RPC:

**Start the node:**
```powershell
# Windows
.\kubercoin.exe node --rpc-port 8332 --http-port 8090

# Linux/macOS
./kubercoin node --rpc-port 8332 --http-port 8090
```

**Configure UI connection:**
- RPC URL: `http://localhost:8332`
- REST API: `http://localhost:8090`

The UIs will auto-detect a local node or you can specify a remote node address.

---

## Development

See [BUILD.md](native-mining-ui/BUILD.md) for detailed build instructions and troubleshooting.

### Project Structure

```
native-mining-ui/
├── windows-winui3/          # Windows WinUI 3 application
│   ├── Views/               # XAML view definitions
│   ├── ViewModels/          # MVVM view models
│   ├── Models/              # Data models
│   └── Services/            # RPC/API services
├── linux-gtk4/              # Linux GTK4 application
│   └── src/                 # Rust source files
└── macos-swiftui/           # macOS SwiftUI application
    ├── Views/               # SwiftUI views
    ├── ViewModels/          # Observable view models
    ├── Models/              # Swift data models
    └── Services/            # Network services
```

---

## Troubleshooting

### Windows: "dotnet command not found"
Install .NET 8.0 SDK from https://dotnet.microsoft.com/download

### Linux: "gtk-4 not found"
Install GTK4 development packages: `sudo apt install libgtk-4-dev libadwaita-1-dev`

### macOS: "xcodebuild: command not found"
Install Xcode Command Line Tools: `xcode-select --install`

### Connection refused to node
Ensure the KuberCoin node is running on the expected ports (8332 for RPC, 8090 for REST)

### High DPI issues on Windows
The app is DPI-aware and should scale correctly. If not, right-click the exe → Properties → Compatibility → Change high DPI settings

---

## Next Steps

1. Install the required SDK/tools for your platform
2. Build the native UI application
3. Start a KuberCoin node
4. Launch the UI and start mining!

For automated builds of all platforms, see `.github/workflows/build-native-ui.yml`

# KuberCoin Native Mining UI

Complete cross-platform native mining dashboard applications for KuberCoin.

## Platform Support

| Platform | Framework | Status | Binary Size |
|----------|-----------|--------|-------------|
| **Windows** | WinUI 3 + .NET 8 | ✅ Complete | ~8-12 MB |
| **Linux** | GTK4 + Rust | ✅ Complete | ~4-6 MB |
| **macOS** | SwiftUI | ✅ Complete | ~3-5 MB |

## Features

All platforms include identical functionality:

### 📊 Dashboard
- Real-time mining status control
- GPU/CPU device counts
- Current profitability (BTC/day, USD)
- Unpaid balance tracking
- Device metrics table
- Active pool information

### 🖥️ Device Management
- Per-device monitoring
- Hashrate, temperature, power stats
- GPU/memory utilization graphs
- Individual device control
- Color-coded temperature alerts

### ⚡ GPU Overclocking
- Power limit adjustment (50-120%)
- Core clock offset (-300 to +300 MHz)
- Memory clock offset (-1000 to +1500 MHz)
- Fan speed control (0-100%, auto)
- Real-time metric monitoring
- Profile save/load
- Safety warnings

### 🌐 Pool Management
- Multiple pool configuration
- Priority-based failover
- Connection status indicators
- Share statistics (accepted/rejected)
- Worker configuration
- TLS/SSL support
- Auto-restart on failure

### 📈 Historical Charts
- Time range selection (24h/7d/30d/all)
- Profitability history
- Hashrate trends
- Temperature monitoring
- Power consumption tracking
- Statistical summaries
- Cost estimates

### 🔔 Alert System
- Temperature thresholds
- Hashrate drop detection
- Device offline alerts
- Pool connection monitoring
- Power consumption limits
- Desktop notifications
- Sound alerts
- Email notifications (optional)
- Alert history
- Configurable intervals

## Quick Start

### Windows

```powershell
cd native-mining-ui\windows-winui3
dotnet restore
dotnet run
```

Requirements:
- Windows 10 1809+ or Windows 11
- .NET 8.0 Runtime
- Windows App SDK 1.5

### Linux

```bash
cd native-mining-ui/linux-gtk4
cargo build --release
./target/release/kubercoin-miner-gtk
```

Requirements:
- GTK4 (>= 4.10)
- libadwaita (>= 1.3)

### macOS

```bash
cd native-mining-ui/macos-swiftui
open KuberCoinMiner.xcodeproj
# Build and run in Xcode (⌘R)
```

Requirements:
- macOS 13.0+
- Xcode 15.0+

## Configuration

All platforms use environment variables:

```bash
export KUBERCOIN_RPC_URL="http://127.0.0.1:8332"
export KUBERCOIN_API_KEY="your_api_key_here"
```

## Architecture

### Windows (WinUI 3)
- **UI**: XAML with Fluent Design
- **Logic**: C# with MVVM pattern
- **Charts**: LiveCharts2 + SkiaSharp
- **Notifications**: Windows App SDK

### Linux (GTK4)
- **UI**: GTK4 + libadwaita
- **Logic**: Rust
- **Charts**: Plotters + Cairo
- **Notifications**: notify-rust

### macOS (SwiftUI)
- **UI**: SwiftUI (declarative)
- **Logic**: Swift + Combine
- **Charts**: Native SwiftUI Charts
- **Notifications**: UserNotifications

## Communication

All platforms communicate with KuberCoin node via:
- **Protocol**: JSON-RPC 2.0
- **Transport**: HTTP POST
- **Default Port**: 8332
- **Authentication**: API key in headers

## Design Philosophy

### Truly Native
- ❌ No Electron
- ❌ No web views
- ❌ No JavaScript
- ✅ Platform-native UI frameworks
- ✅ Native performance
- ✅ Small binary sizes
- ✅ System integration

### Consistent UX
- Same features across all platforms
- Platform-specific design patterns
- Native look and feel
- Keyboard shortcuts
- Accessibility support

## Directory Structure

```
native-mining-ui/
├── windows-winui3/          # Windows WinUI 3 app
│   ├── Views/               # XAML views
│   ├── ViewModels/          # C# view models
│   ├── Models/              # Data models
│   ├── Services/            # Business logic
│   └── README.md
├── linux-gtk4/              # Linux GTK4 app
│   ├── src/
│   │   ├── main.rs          # App entry
│   │   ├── dashboard.rs     # Views
│   │   └── ...
│   ├── Cargo.toml
│   └── README.md
├── macos-swiftui/           # macOS SwiftUI app
│   └── KuberCoinMiner/
│       ├── Views/           # SwiftUI views
│       ├── ViewModels/      # Swift view models
│       ├── Models/          # Data models
│       ├── Services/        # Business logic
│       └── README.md
└── README.md                # This file
```

## Building All Platforms

### Automated Builds

Use the included GitHub Actions workflow:

```yaml
# .github/workflows/build-native-ui.yml
- Windows: Build with dotnet
- Linux: Build with cargo
- macOS: Build with xcodebuild
```

### Manual Builds

```bash
# Windows
cd windows-winui3 && dotnet publish -c Release

# Linux
cd linux-gtk4 && cargo build --release

# macOS
cd macos-swiftui && xcodebuild -configuration Release
```

## Distribution

### Windows
- **Installer**: MSIX package
- **Portable**: Self-contained executable
- **Store**: Microsoft Store compatible

### Linux
- **Package**: .deb, .rpm, Flatpak
- **Binary**: Single executable
- **AppImage**: Portable bundle

### macOS
- **Bundle**: .app bundle
- **DMG**: Disk image installer
- **Homebrew**: Cask formula

## Performance

| Metric | Windows | Linux | macOS |
|--------|---------|-------|-------|
| **Startup** | ~400ms | ~200ms | ~300ms |
| **Memory** | ~120MB | ~80MB | ~90MB |
| **CPU (idle)** | <1% | <1% | <1% |
| **Binary** | 8-12MB | 4-6MB | 3-5MB |

## Development

### Adding New Features

1. Implement in one platform first
2. Port to other platforms maintaining:
   - Same functionality
   - Platform-specific UX patterns
   - Native look and feel

### Testing

```bash
# Windows
dotnet test

# Linux
cargo test

# macOS
xcodebuild test
```

## Contributing

When adding features:
- Maintain feature parity across platforms
- Follow platform-specific design guidelines
- Use native UI components
- Test on all supported platforms
- Update all three READMEs

## License

Part of the KuberCoin project.

## Support

- **Documentation**: See platform-specific READMEs
- **Issues**: GitHub Issues
- **Community**: KuberCoin Discord

---

**Built with native frameworks. Zero web technologies. Maximum performance.**

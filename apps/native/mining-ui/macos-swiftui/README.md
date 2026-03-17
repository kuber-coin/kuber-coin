# KuberCoin Native Mining UI - macOS

A native SwiftUI desktop application for managing KuberCoin mining operations on macOS.

## Features

### Dashboard
- Real-time mining status with circular control
- GPU/CPU device count display
- Current profitability tracking (BTC/day and USD)
- Unpaid balance monitoring
- Device list with live metrics
- Active pool information with share acceptance

### Devices Management
- Individual device monitoring for all GPUs and CPUs
- Real-time performance metrics
- GPU and memory utilization with native progress indicators
- Temperature monitoring with visual feedback
- Enable/disable individual devices

### GPU Overclocking
- Per-GPU overclocking controls using native sliders
- Adjustable parameters:
  - Power limit (50-120%)
  - Core clock offset (-300 to +300 MHz)
  - Memory clock offset (-1000 to +1500 MHz)
  - Fan speed (0-100%, auto at 0%)
- Real-time monitoring of all metrics
- Safety warnings
- Profile management

### Pool Management
- Multiple pool configuration
- Priority-based failover
- Live status indicators
- Statistics tracking:
  - Accepted/rejected shares
  - Connection uptime
  - Worker configuration
- Auto-restart on connection failure
- TLS/SSL support

### Historical Charts
- Native SwiftUI Charts framework
- Time range selection (24h, 7d, 30d, all time)
- Performance visualizations:
  - Profitability trends
  - Hashrate history
  - Temperature monitoring
  - Power consumption
- Statistical summaries
- Cost estimates

### Alert System
- Configurable alert rules
- Native macOS notifications (UNUserNotification)
- Alert types:
  - Temperature thresholds
  - Hashrate monitoring
  - Device status
  - Pool connectivity
  - Power limits
- Alert history
- Email notifications (optional)
- Adjustable check intervals

## Requirements

- macOS 13.0 (Ventura) or later
- Xcode 15.0 or later
- Swift 5.9 or later

## Building

### Using Xcode

1. Open the project:
```bash
cd native-mining-ui/macos-swiftui
open KuberCoinMiner.xcodeproj
```

2. Select your signing team in Xcode
3. Build and run (⌘R)

### Using Command Line

```bash
cd native-mining-ui/macos-swiftui
xcodebuild -project KuberCoinMiner.xcodeproj \
    -scheme KuberCoinMiner \
    -configuration Release \
    build
```

The app bundle will be in:
```
build/Release/KuberCoinMiner.app
```

## Running

Set environment variables before launching:

```bash
export KUBERCOIN_RPC_URL="http://127.0.0.1:8332"
export KUBERCOIN_API_KEY="your_api_key_here"
open KuberCoinMiner.app
```

Or set in Xcode scheme environment variables.

## Architecture

- **SwiftUI**: Modern declarative UI framework
- **Combine**: Reactive programming for state management
- **Charts**: Native SwiftUI Charts for visualizations
- **UserNotifications**: Native macOS notification system
- **URLSession**: Async/await networking for RPC
- **MVVM Pattern**: Clean separation of concerns

## Project Structure

```
macos-swiftui/
└── KuberCoinMiner/
    ├── KuberCoinMinerApp.swift     # App entry point
    ├── ContentView.swift            # Main navigation
    ├── Views/
    │   ├── DashboardView.swift
    │   ├── DevicesView.swift
    │   ├── OverclockingView.swift
    │   ├── PoolsView.swift
    │   ├── ChartsView.swift
    │   └── AlertsView.swift
    ├── ViewModels/                  # View state management
    ├── Models/                      # Data models
    └── Services/                    # Business logic
```

## Design

The app follows Apple's Human Interface Guidelines:
- Native macOS window chrome
- System fonts (SF Pro)
- Native controls and widgets
- Light/Dark mode support
- Vibrancy and translucency
- Keyboard shortcuts
- Accessibility support

## Code Signing

For distribution, you'll need:
- Apple Developer account
- Developer ID Application certificate
- Notarization for Gatekeeper

```bash
codesign --deep --force --verify --verbose \
    --sign "Developer ID Application: Your Name" \
    KuberCoinMiner.app

xcrun notarytool submit KuberCoinMiner.app.zip \
    --apple-id your@email.com \
    --team-id TEAMID \
    --password app-specific-password
```

## Distribution

### DMG Creation

```bash
hdiutil create -volname "KuberCoin Miner" \
    -srcfolder KuberCoinMiner.app \
    -ov -format UDZO \
    KuberCoinMiner.dmg
```

### Homebrew Cask

```ruby
cask "kubercoin-miner" do
  version "1.0.0"
  sha256 "..."
  
  url "https://releases.kuber-coin.com/KuberCoinMiner-#{version}.dmg"
  name "KuberCoin Miner"
  desc "Native mining dashboard for KuberCoin"
  homepage "https://kuber-coin.com"
  
  app "KuberCoinMiner.app"
end
```

## License

Part of the KuberCoin project.

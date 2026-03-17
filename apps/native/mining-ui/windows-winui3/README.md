# KuberCoin Native Mining UI - Windows

A native WinUI 3 desktop application for managing KuberCoin mining operations on Windows 10/11.

## Features

### Dashboard
- Real-time mining status with visual indicators
- GPU/CPU device count
- Current profitability display (BTC/day and USD equivalent)
- Unpaid balance tracking
- Device list with hashrate, temperature, and power stats
- Active pool information with share acceptance rates

### Devices Management
- Individual device monitoring (GPUs and CPUs)
- Real-time metrics:
  - Hashrate
  - Temperature (color-coded)
  - Power consumption
  - Fan speed
- GPU and memory utilization graphs
- Enable/disable individual devices

### GPU Overclocking
- Per-GPU overclocking controls:
  - Power limit adjustment (50-120%)
  - Core clock offset (-300 to +300 MHz)
  - Memory clock offset (-1000 to +1500 MHz)
  - Fan speed control (0-100%, 0=auto)
- Real-time temperature and clock monitoring
- Safety warnings and recommendations
- Profile save/load functionality

### Pool Management
- Multiple pool configuration
- Priority-based failover system
- Real-time connection status
- Statistics tracking:
  - Accepted/rejected shares
  - Connection uptime
  - Worker performance
- Auto-restart on connection failure
- TLS/SSL support

### Historical Charts
- Time range selection (24h, 7d, 30d, all time)
- Interactive charts using LiveCharts2:
  - Profitability history
  - Hashrate trends
  - GPU temperature monitoring
  - Power consumption tracking
- Statistical summaries (averages, totals)
- Monthly electricity cost estimation

### Alert System
- Configurable alert rules:
  - Temperature thresholds
  - Hashrate drops
  - Device offline detection
  - Pool connection issues
  - Power consumption limits
- Multiple notification methods:
  - Desktop notifications
  - Sound alerts
  - Email notifications
- Alert history with timestamps
- Adjustable check intervals

## Requirements

- Windows 10 version 1809 (build 17763) or later
- Windows 11
- .NET 8.0 Runtime
- Windows App SDK 1.5

## Building

```powershell
cd native-mining-ui\windows-winui3
dotnet restore
dotnet build
```

## Running

```powershell
dotnet run
```

Or build and run the release version:

```powershell
dotnet build -c Release
.\bin\Release\net8.0-windows10.0.19041.0\win-x64\KuberCoinMiner.exe
```

## Configuration

Set environment variables before running:

```powershell
$env:KUBERCOIN_RPC_URL = "http://127.0.0.1:8332"
$env:KUBERCOIN_API_KEY = "your_api_key_here"
```

## Architecture

- **MVVM Pattern**: ViewModels handle business logic, Views are pure XAML
- **CommunityToolkit.Mvvm**: Modern MVVM helpers and observable properties
- **LiveCharts2**: Native chart rendering with SkiaSharp
- **WinUI 3**: Native Windows UI with Fluent Design
- **Services Layer**: Isolated business logic for mining, alerts, charts, etc.

## Project Structure

```
windows-winui3/
├── Views/              # XAML views
│   ├── DashboardView.xaml
│   ├── DevicesView.xaml
│   ├── OverclockingView.xaml
│   ├── PoolsView.xaml
│   ├── ChartsView.xaml
│   └── AlertsView.xaml
├── ViewModels/         # View logic
├── Models/             # Data models
├── Services/           # Business logic
└── App.xaml           # Application resources
```

## Styling

Custom theme with:
- Brand indigo accent color (#627EEA) with cyan highlight support
- Card-based layout with rounded corners
- Fluent Design shadows and materials
- Responsive spacing and typography

## License

Part of the KuberCoin project.

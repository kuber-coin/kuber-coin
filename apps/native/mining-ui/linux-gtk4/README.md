# KuberCoin Native Mining UI - Linux

A native GTK4 desktop application for managing KuberCoin mining operations on Linux.

## Features

### Dashboard
- Real-time mining status with visual controls
- GPU/CPU device count display
- Current profitability tracking (BTC/day and USD)
- Unpaid balance monitoring
- Device list with live metrics (hashrate, temperature, power)
- Active pool information with share acceptance rates

### Devices Management
- Individual device monitoring for all GPUs and CPUs
- Real-time performance metrics
- GPU and memory utilization visualization
- Temperature monitoring with color coding
- Enable/disable individual devices

### GPU Overclocking
- Per-GPU overclocking controls with sliders
- Adjustable parameters:
  - Power limit (50-120%)
  - Core clock offset (-300 to +300 MHz)
  - Memory clock offset (-1000 to +1500 MHz)
  - Fan speed (0-100%, auto at 0%)
- Real-time clock and temperature monitoring
- Safety warnings included
- Profile save/load capability

### Pool Management
- Configure multiple mining pools
- Priority-based failover system
- Live connection status indicators
- Statistics tracking:
  - Accepted and rejected shares
  - Connection uptime
  - Worker names and configuration
- Auto-restart on connection failure
- Support for TLS/SSL connections

### Historical Charts
- Time range selection (24h, 7d, 30d, all time)
- Interactive performance charts:
  - Profitability history
  - Hashrate trends
  - GPU temperature monitoring
  - Power consumption tracking
- Statistical summaries and averages
- Monthly electricity cost estimates

### Alert System
- Configurable alert rules for:
  - Temperature thresholds
  - Hashrate drop detection
  - Device offline monitoring
  - Pool connection issues
  - Power consumption limits
- Multiple notification methods:
  - Desktop notifications (via notify-rust)
  - Sound alerts
  - Email notifications
- Alert history with timestamps
- Configurable check intervals

## Requirements

### Runtime Dependencies
- GTK4 (>= 4.10)
- libadwaita (>= 1.3)
- cairo
- pango

### Debian/Ubuntu
```bash
sudo apt install libgtk-4-dev libadwaita-1-dev libcairo2-dev
```

### Fedora
```bash
sudo dnf install gtk4-devel libadwaita-devel cairo-devel
```

### Arch Linux
```bash
sudo pacman -S gtk4 libadwaita cairo
```

## Building

```bash
cd native-mining-ui/linux-gtk4
cargo build --release
```

The binary will be at `target/release/kubercoin-miner-gtk`

## Running

```bash
export KUBERCOIN_RPC_URL="http://127.0.0.1:8332"
export KUBERCOIN_API_KEY="your_api_key_here"
./target/release/kubercoin-miner-gtk
```

## Architecture

- **GTK4**: Modern GNOME toolkit for native Linux UI
- **libadwaita**: GNOME's design patterns and widgets
- **Rust**: Safe, concurrent backend
- **Plotters**: Chart rendering with Cairo backend
- **notify-rust**: Native desktop notifications
- **Tokio**: Async runtime for RPC communication

## Project Structure

```
linux-gtk4/
├── src/
│   ├── main.rs           # Application entry point
│   ├── dashboard.rs      # Dashboard view
│   ├── devices.rs        # Devices management view
│   ├── overclocking.rs   # GPU overclocking controls
│   ├── pools.rs          # Pool management view
│   ├── charts.rs         # Historical charts view
│   ├── alerts.rs         # Alert configuration view
│   ├── models.rs         # Data models
│   └── services.rs       # Business logic services
├── Cargo.toml
└── README.md
```

## Styling

The application uses:
- GNOME's Adwaita design language
- Custom CSS for brand colors (indigo accent: #627eea with cyan highlights)
- Card-based layout with rounded corners
- Responsive spacing following GNOME HIG

## Desktop Integration

Create a `.desktop` file for application menu integration:

```desktop
[Desktop Entry]
Name=KuberCoin Miner
Comment=Mining dashboard for KuberCoin
Exec=/path/to/kubercoin-miner-gtk
Icon=kubercoin-miner
Terminal=false
Type=Application
Categories=Utility;System;
```

## License

Part of the KuberCoin project.

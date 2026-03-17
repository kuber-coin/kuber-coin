#!/usr/bin/env pwsh
# KuberCoin Mining Dashboard Demo/Simulator
# Simulates the native UI functionality without requiring full framework installation

[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidAssignmentToAutomaticVariable', '', Justification='False positive: script no longer assigns to the automatic Error variable.')]

param(
    [switch]$FullScreen = $false
)

# Colors and styling
$Palette = '{"BrandOrange":"DarkYellow","Success":"Green","Warning":"Yellow","Danger":"Red","Info":"Cyan"}' | ConvertFrom-Json

# Mining state
# Demo state lives at script scope for the interactive loop.
$script:IsMining = $false
$script:Devices = @(
    [pscustomobject]@{ 'Name' = "GPU 0"; 'Model' = "NVIDIA RTX 3080"; 'Hashrate' = 125; 'Temp' = 62; 'Power' = 180; 'Fan' = 65; 'Active' = $true }
    [pscustomobject]@{ 'Name' = "GPU 1"; 'Model' = "NVIDIA RTX 3080"; 'Hashrate' = 124; 'Temp' = 64; 'Power' = 182; 'Fan' = 68; 'Active' = $true }
    [pscustomobject]@{ 'Name' = "GPU 2"; 'Model' = "NVIDIA RTX 3080"; 'Hashrate' = 126; 'Temp' = 61; 'Power' = 179; 'Fan' = 63; 'Active' = $true }
    [pscustomobject]@{ 'Name' = "GPU 3"; 'Model' = "NVIDIA RTX 3080"; 'Hashrate' = 125; 'Temp' = 63; 'Power' = 181; 'Fan' = 66; 'Active' = $true }
    [pscustomobject]@{ 'Name' = "CPU 0"; 'Model' = "AMD Ryzen 9 5950X"; 'Hashrate' = 15; 'Temp' = 58; 'Power' = 95; 'Fan' = 45; 'Active' = $true }
)

$script:CurrentView = "Dashboard"
$script:SelectedDevice = 0

function Clear-Screen {
    Clear-Host
    if ($FullScreen) {
        $Host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(120, 40)
    }
}

function Write-Header {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor $Palette.BrandOrange
    Write-Host "║                    " -NoNewline -ForegroundColor $Palette.BrandOrange
    Write-Host "KuberCoin Mining Dashboard Demo" -NoNewline -ForegroundColor White
    Write-Host "                     ║" -ForegroundColor $Palette.BrandOrange
    Write-Host "╠════════════════════════════════════════════════════════════════════════════╣" -ForegroundColor $Palette.BrandOrange
    Write-Host "║ [1] Dashboard  [2] Devices  [3] Pools  [4] Overclocking  [5] Charts       ║" -ForegroundColor Gray
    Write-Host "║ [6] Alerts     [Q] Quit                                                    ║" -ForegroundColor Gray
    Write-Host "╚════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor $Palette.BrandOrange
    Write-Host ""
}

function Show-Dashboard {
    Write-Host "═══ DASHBOARD ═══" -ForegroundColor $Palette.Info
    Write-Host ""
    
    # Mining Status
    $Status = if ($script:IsMining) { "MINING" } else { "PAUSED" }
    $StatusColor = if ($script:IsMining) { $Palette.Success } else { $Palette.Warning }
    Write-Host "   ╔═══════════════╗" -ForegroundColor $Palette.BrandOrange
    Write-Host "   ║   $Status     ║" -ForegroundColor $StatusColor
    Write-Host "   ╚═══════════════╝" -ForegroundColor $Palette.BrandOrange
    Write-Host ""
    Write-Host "   Press [SPACE] to toggle mining" -ForegroundColor Gray
    Write-Host ""
    
    # Metrics
    $ActiveGpus = ($script:Devices | Where-Object { $_.Name -like "GPU*" -and $_.Active }).Count
    $ActiveCpus = ($script:Devices | Where-Object { $_.Name -like "CPU*" -and $_.Active }).Count
    $TotalHashrate = ($script:Devices | Where-Object { $_.Active } | Measure-Object -Property Hashrate -Sum).Sum
    
    Write-Host "┌────────────┬────────────┬──────────────────────────────────┐" -ForegroundColor Gray
    Write-Host "│    " -NoNewline -ForegroundColor Gray
    Write-Host "$ActiveGpus      " -NoNewline -ForegroundColor White
    Write-Host "│    " -NoNewline -ForegroundColor Gray
    Write-Host "$ActiveCpus      " -NoNewline -ForegroundColor White
    Write-Host "│   0.0191616 BTC / 24h            │" -NoNewline -ForegroundColor White
    Write-Host "" -ForegroundColor Gray
    Write-Host "│   GPU'S    │   CPU      │   ≈ `$141.69                     │" -ForegroundColor Gray
    Write-Host "└────────────┴────────────┴──────────────────────────────────┘" -ForegroundColor Gray
    Write-Host ""
    
    # Unpaid Balance
    Write-Host "UNPAID BALANCE" -ForegroundColor Gray
    Write-Host "  0.0191616 BTC  (≈ `$141.69)" -ForegroundColor White
    Write-Host ""
    
    # Device List
    Write-Host "MINING DEVICES" -ForegroundColor White
    Write-Host "┌──────────┬──────────────────────┬───────────┬──────────┬────────┐" -ForegroundColor Gray
    Write-Host "│ Device   │ Model                │ Hashrate  │ Temp     │ Power  │" -ForegroundColor Gray
    Write-Host "├──────────┼──────────────────────┼───────────┼──────────┼────────┤" -ForegroundColor Gray
    
    foreach ($Device in $script:Devices) {
        $TempColor = if ($Device.Temp -lt 65) { $Palette.Success } elseif ($Device.Temp -lt 75) { $Palette.Warning } else { $Palette.Danger }
        $StatusIcon = if ($Device.Active) { "●" } else { "○" }
        
        Write-Host "│ " -NoNewline -ForegroundColor Gray
        Write-Host "$StatusIcon" -NoNewline -ForegroundColor $(if ($Device.Active) { $Palette.Success } else { $Palette.Danger })
        Write-Host " $($Device.Name.PadRight(6))" -NoNewline -ForegroundColor White
        Write-Host "│ $($Device.Model.PadRight(20))" -NoNewline -ForegroundColor Gray
        Write-Host "│ $($Device.Hashrate) MH/s".PadRight(10) -NoNewline -ForegroundColor White
        Write-Host "│ " -NoNewline -ForegroundColor Gray
        Write-Host "$($Device.Temp)°C".PadRight(9) -NoNewline -ForegroundColor $TempColor
        Write-Host "│ $($Device.Power)W".PadRight(7) -NoNewline -ForegroundColor White
        Write-Host "│" -ForegroundColor Gray
    }
    
    Write-Host "└──────────┴──────────────────────┴───────────┴──────────┴────────┘" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Total Hashrate: $TotalHashrate MH/s" -ForegroundColor $Palette.BrandOrange
    Write-Host ""
    
    # Pool Info
    Write-Host "ACTIVE POOL: " -NoNewline -ForegroundColor Gray
    Write-Host "pool.kuber-coin.com:3333" -NoNewline -ForegroundColor White
    Write-Host "  │  SHARE ACCEPTANCE: " -NoNewline -ForegroundColor Gray
    Write-Host "99.2%" -ForegroundColor $Palette.Success
    Write-Host ""
}

function Show-Devices {
    Write-Host "═══ DEVICES ═══" -ForegroundColor $Palette.Info
    Write-Host ""
    Write-Host "Use [←→] to navigate, [SPACE] to toggle device, [ENTER] for details" -ForegroundColor Gray
    Write-Host ""
    
    for ($i = 0; $i -lt $script:Devices.Count; $i++) {
        $Device = $script:Devices[$i]
        $Selected = ($i -eq $script:SelectedDevice)
        $Prefix = if ($Selected) { "▶" } else { " " }
        $Color = if ($Selected) { $Palette.BrandOrange } else { "White" }
        
        Write-Host "$Prefix $($Device.Name) - $($Device.Model)" -ForegroundColor $Color
        Write-Host "  Hashrate: $($Device.Hashrate) MH/s  │  Temp: $($Device.Temp)°C  │  Power: $($Device.Power)W  │  Fan: $($Device.Fan)%" -ForegroundColor Gray
        Write-Host "  GPU Util: 98%  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░  │  Mem Util: 85%  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░" -ForegroundColor Gray
        Write-Host "  Status: " -NoNewline -ForegroundColor Gray
        Write-Host $(if ($Device.Active) { "Active" } else { "Disabled" }) -ForegroundColor $(if ($Device.Active) { $Palette.Success } else { $Palette.Danger })
        Write-Host ""
    }
}

function Show-Overclocking {
    Write-Host "═══ GPU OVERCLOCKING ═══" -ForegroundColor $Palette.Info
    Write-Host ""
    Write-Host "⚠ WARNING: Overclocking may void warranty and damage hardware!" -ForegroundColor $Palette.Warning
    Write-Host ""
    
    $Device = $script:Devices[$script:SelectedDevice]
    
    if ($Device.Name -notlike "GPU*") {
        Write-Host "Please select a GPU device (use Devices view)" -ForegroundColor $Palette.Warning
        return
    }
    
    Write-Host "Device: " -NoNewline -ForegroundColor White
    Write-Host "$($Device.Name) - $($Device.Model)" -ForegroundColor $Palette.BrandOrange
    Write-Host ""
    
    Write-Host "Temperature: $($Device.Temp)°C  │  Power Draw: $($Device.Power)W" -ForegroundColor Gray
    Write-Host "Core Clock: 1725 MHz  │  Memory Clock: 9501 MHz" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "Power Limit: 85%" -ForegroundColor White
    Write-Host "  [50%] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░ [120%]" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "Core Clock Offset: +100 MHz" -ForegroundColor White
    Write-Host "  [-300] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ [+300]" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "Memory Clock Offset: +500 MHz" -ForegroundColor White
    Write-Host "  [-1000] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ [+1500]" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "Fan Speed: $($Device.Fan)%" -ForegroundColor White
    Write-Host "  [Auto] ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░ [100%]" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "[A] Apply Settings  [S] Save Profile  [R] Reset to Default" -ForegroundColor $Palette.Info
    Write-Host ""
}

function Show-Charts {
    Write-Host "═══ HISTORICAL CHARTS ═══" -ForegroundColor $Palette.Info
    Write-Host ""
    Write-Host "[1] 24 Hours  [2] 7 Days  [3] 30 Days  [4] All Time" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "PROFITABILITY HISTORY" -ForegroundColor White
    Write-Host "  Total: 0.1524 BTC  │  Avg Daily: 0.0191 BTC" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  0.022 │                              ╱╲    " -ForegroundColor $Palette.Success
    Write-Host "  0.020 │                     ╱╲      ╱  ╲   " -ForegroundColor $Palette.Success
    Write-Host "  0.018 │            ╱╲      ╱  ╲    ╱    ╲  " -ForegroundColor $Palette.Success
    Write-Host "  0.016 │       ╱╲  ╱  ╲    ╱    ╲  ╱      ╲" -ForegroundColor $Palette.Success
    Write-Host "  0.014 │  ╱╲  ╱  ╲╱    ╲  ╱      ╲╱        " -ForegroundColor $Palette.Success
    Write-Host "        └────────────────────────────────────" -ForegroundColor Gray
    Write-Host "         0h    4h    8h   12h   16h   20h  24h" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "HASHRATE HISTORY" -ForegroundColor White
    Write-Host "  Current: 515 MH/s  │  Average: 512 MH/s" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  530 │                    ╱───╲         " -ForegroundColor $Palette.Info
    Write-Host "  520 │          ╱───╲   ╱     ╲        " -ForegroundColor $Palette.Info
    Write-Host "  510 │    ╱────╱     ╲─╱       ╲───    " -ForegroundColor $Palette.Info
    Write-Host "  500 │   ╱                         ╲   " -ForegroundColor $Palette.Info
    Write-Host "  490 │──╱                           ╲──" -ForegroundColor $Palette.Info
    Write-Host "      └────────────────────────────────────" -ForegroundColor Gray
    Write-Host "       0h    4h    8h   12h   16h   20h  24h" -ForegroundColor Gray
    Write-Host ""
}

function Show-Alerts {
    Write-Host "═══ ALERT CONFIGURATION ═══" -ForegroundColor $Palette.Info
    Write-Host ""
    
    Write-Host "ALERT RULES" -ForegroundColor White
    Write-Host ""
    Write-Host "● GPU Temperature Warning" -ForegroundColor $Palette.Warning
    Write-Host "  Alert when GPU temperature exceeds 75°C" -ForegroundColor Gray
    Write-Host "  Last triggered: 2 hours ago" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "● Hashrate Drop" -ForegroundColor $Palette.Danger
    Write-Host "  Alert when hashrate drops below 450 MH/s" -ForegroundColor Gray
    Write-Host "  Last triggered: Never" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "● Pool Connection Lost" -ForegroundColor $Palette.Warning
    Write-Host "  Alert when pool connection is lost" -ForegroundColor Gray
    Write-Host "  Last triggered: Yesterday" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "RECENT ALERTS" -ForegroundColor White
    Write-Host ""
    Write-Host "[!] GPU 1 Temperature High - 76C - 2 hours ago" -ForegroundColor $Palette.Warning
    Write-Host "[!] Pool Connection Restored - 5 hours ago" -ForegroundColor $Palette.Success
    Write-Host "[!] GPU 2 Temperature High - 77C - 6 hours ago" -ForegroundColor $Palette.Warning
    Write-Host ""
    
    Write-Host "[E] Enable Notifications  [C] Configure Email  [+] Add Rule" -ForegroundColor $Palette.Info
    Write-Host ""
}

function Show-Pools {
    Write-Host "═══ MINING POOLS ═══" -ForegroundColor $Palette.Info
    Write-Host ""
    
    Write-Host "● KuberCoin Official - " -NoNewline -ForegroundColor $Palette.Success
    Write-Host "pool.kuber-coin.com:3333" -ForegroundColor White
    Write-Host "  Status: Connected  │  Accepted: 15,243  │  Rejected: 12  │  Uptime: 23h 45m" -ForegroundColor Gray
    Write-Host "  Worker: rig001  │  Priority: Primary" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "○ Backup Pool - " -NoNewline -ForegroundColor $Palette.Warning
    Write-Host "pool2.kuber-coin.com:3333" -ForegroundColor White
    Write-Host "  Status: Standby  │  Accepted: 0  │  Rejected: 0  │  Uptime: 0h 0m" -ForegroundColor Gray
    Write-Host "  Worker: rig001  │  Priority: Failover 1" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "[+] Add Pool  [E] Edit  [D] Delete  [T] Test Connection" -ForegroundColor $Palette.Info
    Write-Host ""
}

# Main loop
Clear-Screen

while ($true) {
    Clear-Screen
    Write-Header
    
    switch ($script:CurrentView) {
        "Dashboard" { Show-Dashboard }
        "Devices" { Show-Devices }
        "Pools" { Show-Pools }
        "Overclocking" { Show-Overclocking }
        "Charts" { Show-Charts }
        "Alerts" { Show-Alerts }
    }
    
    Write-Host "────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "Current View: " -NoNewline -ForegroundColor Gray
    Write-Host $script:CurrentView -ForegroundColor $Palette.BrandOrange
    Write-Host ""
    
    if ($Host.UI.RawUI.KeyAvailable) {
        $Key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        
        switch ($Key.Character) {
            '1' { $script:CurrentView = "Dashboard" }
            '2' { $script:CurrentView = "Devices" }
            '3' { $script:CurrentView = "Pools" }
            '4' { $script:CurrentView = "Overclocking" }
            '5' { $script:CurrentView = "Charts" }
            '6' { $script:CurrentView = "Alerts" }
            'q' { 
                Clear-Screen
                Write-Host "Thanks for using KuberCoin Mining Dashboard!" -ForegroundColor $Palette.BrandOrange
                Write-Host ""
                exit 0
            }
            'Q' { 
                Clear-Screen
                Write-Host "Thanks for using KuberCoin Mining Dashboard!" -ForegroundColor $Palette.BrandOrange
                Write-Host ""
                exit 0
            }
            ' ' { 
                if ($script:CurrentView -eq "Dashboard") {
                    $script:IsMining = -not $script:IsMining
                }
                elseif ($script:CurrentView -eq "Devices") {
                    $script:Devices[$script:SelectedDevice].Active = -not $script:Devices[$script:SelectedDevice].Active
                }
            }
        }
        
        # Arrow key navigation in Devices view
        if ($script:CurrentView -eq "Devices") {
            if ($Key.VirtualKeyCode -eq 37) { # Left arrow
                $script:SelectedDevice = [Math]::Max(0, $script:SelectedDevice - 1)
            }
            elseif ($Key.VirtualKeyCode -eq 39) { # Right arrow
                $script:SelectedDevice = [Math]::Min($script:Devices.Count - 1, $script:SelectedDevice + 1)
            }
            elseif ($Key.VirtualKeyCode -eq 38) { # Up arrow
                $script:SelectedDevice = [Math]::Max(0, $script:SelectedDevice - 1)
            }
            elseif ($Key.VirtualKeyCode -eq 40) { # Down arrow
                $script:SelectedDevice = [Math]::Min($script:Devices.Count - 1, $script:SelectedDevice + 1)
            }
        }
    }
    
    Start-Sleep -Milliseconds 100
}

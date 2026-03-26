param(
  [switch]$Clean,
  [switch]$SkipWindows,
  [switch]$SkipLinuxWsl
)

$ErrorActionPreference = 'Stop'

function Invoke-Step([string]$Name, [scriptblock]$Step) {
  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  & $Step
  if (-not $?) {
    throw "Step failed: $Name"
  }
  if ($global:LASTEXITCODE -ne 0) {
    throw ("Step failed: {0} (exit {1})" -f $Name, $global:LASTEXITCODE)
  }
  Write-Host "OK: $Name" -ForegroundColor Green
}

if (-not $SkipWindows) {
  Invoke-Step 'Native UI Windows' {
    if ($Clean) {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_native_ui_windows.ps1') -Clean
    } else {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_native_ui_windows.ps1')
    }
  }
}

if (-not $SkipLinuxWsl) {
  Invoke-Step 'Native UI Linux WSL' {
    if ($Clean) {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_native_ui_linux_wsl.ps1') -Clean
    } else {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ci_native_ui_linux_wsl.ps1')
    }
  }
}

Write-Host "`nNATIVE UI LOCAL MIRRORS PASSED" -ForegroundColor Green
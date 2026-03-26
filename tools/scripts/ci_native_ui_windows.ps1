param(
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$ScriptPath = Join-Path $PSScriptRoot 'build_native_ui_windows.ps1'

if ($Clean) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -Clean
} else {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath
}

if ($LASTEXITCODE -ne 0) {
  throw 'Windows native UI build failed'
}
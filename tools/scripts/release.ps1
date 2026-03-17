# scripts/release.ps1 — build a release binary and generate a SHA-256 checksum.
#
# Usage:
#   .\scripts\release.ps1 [-Target <rust-target-triple>]
#
# Examples:
#   .\scripts\release.ps1
#   .\scripts\release.ps1 -Target x86_64-pc-windows-msvc
#
# Outputs (under target\release\ or target\<Target>\release\):
#   kubercoin-node.exe          — the release binary
#   kubercoin-node.exe.sha256   — SHA-256 checksum (one-line, sha256sum-compatible)
#   kubercoin-node.exe.version  — git describe output (version string)

[CmdletBinding()]
param(
    [string]$Target = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==> Building Kubercoin release binary"
if ($Target -ne "") {
    cargo build --release -p node --target $Target
    $BinaryDir = "target\$Target\release"
} else {
    cargo build --release -p node
    $BinaryDir = "target\release"
}

$Binary = Join-Path $BinaryDir "kubercoin-node.exe"

if (-not (Test-Path $Binary)) {
    Write-Error "Expected binary not found at $Binary"
    exit 1
}

# Record version string
$Version = try {
    git describe --tags --always --dirty 2>$null
} catch {
    "unknown"
}
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = "unknown" }
Set-Content -Path "${Binary}.version" -Value $Version -Encoding UTF8
Write-Host "==> Version: $Version"

# Generate SHA-256 checksum
Write-Host "==> Generating SHA-256 checksum"
$Hash = (Get-FileHash -Path $Binary -Algorithm SHA256).Hash.ToLower()
$FileName = Split-Path $Binary -Leaf
$ChecksumLine = "$Hash  $FileName"
Set-Content -Path "${Binary}.sha256" -Value $ChecksumLine -Encoding UTF8

Write-Host $ChecksumLine
Write-Host ""
Write-Host "==> Release artifacts:"
Write-Host "    Binary:   $Binary"
Write-Host "    Checksum: ${Binary}.sha256"
Write-Host "    Version:  ${Binary}.version"
Write-Host ""
Write-Host "    Verify with (PowerShell):"
Write-Host "      \$expected = (Get-Content '${Binary}.sha256').Split()[0]"
Write-Host "      \$actual   = (Get-FileHash '$Binary' -Algorithm SHA256).Hash.ToLower()"
Write-Host "      if (\$actual -eq \$expected) { 'OK' } else { 'MISMATCH' }"

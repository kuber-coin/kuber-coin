<#
.SYNOPSIS
    KuberCoin Mainnet Readiness Runner (Windows)
.DESCRIPTION
    Performs non-destructive launch readiness checks against the current node
    runtime, documentation, and optional live seed endpoints.
#>
[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipDnsChecks,
    [switch]$Strict,
    [switch]$Json,
    [switch]$RequireApiKeys,
    [string]$Binary,
    [string]$LogFile = "launch_$(Get-Date -Format 'yyyyMMdd_HHmmss').log",
    [int]$P2PPort = 8633,
    [int]$ApiPort = 8634,
    [string[]]$SeedHttpUrl = @(),
    [string[]]$DnsSeed = @(
        "seed1.kuber-coin.com",
        "seed2.kuber-coin.com",
        "seed3.kuber-coin.com",
        "dnsseed.kuber-coin.com"
    ),
    [string[]]$HardcodedSeed = @(
        "192.0.2.11:8633",
        "198.51.100.21:8633",
        "203.0.113.31:8633"
    )
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $Binary) {
    $Binary = Join-Path $WorkspaceRoot "target\release\kubercoin-node.exe"
}
$Docs = @(
    (Join-Path $WorkspaceRoot "docs\LAUNCH_CHECKLIST.md"),
    (Join-Path $WorkspaceRoot "docs\SEED_INFRASTRUCTURE.md"),
    (Join-Path $WorkspaceRoot "docs\MAINNET_POLICY.md"),
    (Join-Path $WorkspaceRoot "docs\INCIDENT_RESPONSE.md")
)

. "$PSScriptRoot\common_build.ps1"

function Write-Step  { param([string]$Msg) Write-Host "`n=== $Msg ===" -ForegroundColor Cyan;  Add-Content $LogFile "=== $Msg ===" }
function Write-OK    { param([string]$Msg) Write-Host "[OK] $Msg" -ForegroundColor Green;   Add-Content $LogFile "[OK] $Msg"  }
function Write-Warn  { param([string]$Msg) Write-Host "[WARN] $Msg" -ForegroundColor Yellow; Add-Content $LogFile "[WARN] $Msg" }
function Write-Fail  { param([string]$Msg) Write-Host "[FAIL] $Msg" -ForegroundColor Red;   Add-Content $LogFile "[FAIL] $Msg"; throw $Msg }

function Get-WorkspaceVersion {
    $cargoToml = Get-Content (Join-Path $WorkspaceRoot "Cargo.toml") -Raw
    $match = [regex]::Match($cargoToml, '(?s)\[workspace\.package\].*?version\s*=\s*"([^"]+)"')
    if (-not $match.Success) {
        Write-Fail "workspace.package version not found in Cargo.toml"
    }
    return $match.Groups[1].Value
}

function Resolve-BinaryPath {
    param([string]$Path)

    if (Test-Path $Path) {
        return (Resolve-Path $Path).Path
    }

    Write-Warn "Binary not found, building release node..."
    Invoke-NodeReleaseBuild -WorkspaceRoot $WorkspaceRoot -StopRunningNode *>&1 | Tee-Object -Append -FilePath $LogFile

    if (-not (Test-Path $Path)) {
        Write-Fail "Unable to locate kubercoin-node after build"
    }

    return (Resolve-Path $Path).Path
}

function Get-BinaryVersion {
    param([string]$Path)

    $versionOutput = & $Path --version 2>&1 | Out-String
    $match = [regex]::Match($versionOutput, '(\d+\.\d+\.\d+)')
    if ($match.Success) {
        return $match.Groups[1].Value
    }
    return 'unknown'
}

function Invoke-LoggedCommand {
    param(
        [string]$Description,
        [scriptblock]$Command
    )

    Write-Step $Description
    & $Command *>&1 | Tee-Object -Append -FilePath $LogFile
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "$Description failed"
    }
    Write-OK "$Description passed"
}

function Resolve-DnsSeed {
    param([string]$HostName)

    try {
        $addresses = [System.Net.Dns]::GetHostAddresses($HostName) |
            Select-Object -ExpandProperty IPAddressToString -Unique |
            Sort-Object
    } catch {
        Write-Fail "DNS seed resolution failed for ${HostName}: $($_.Exception.Message)"
    }
    return $addresses
}

function Invoke-SeedHttpCheck {
    param([string]$BaseUrl)

    try {
        $health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 5
        $info = Invoke-RestMethod -Uri "$BaseUrl/api/info" -TimeoutSec 5
    } catch {
        Write-Fail "HTTP seed check failed for ${BaseUrl}: $($_.Exception.Message)"
    }

    if ($health.status -ne 'ok') {
        Write-Fail "HTTP seed check reported unhealthy status for $BaseUrl"
    }

    return [ordered]@{
        url = $BaseUrl
        height = if ($null -ne $info.height) { $info.height } elseif ($null -ne $info.blocks) { $info.blocks } else { 0 }
        tip = if ($null -ne $info.tip) { $info.tip } elseif ($null -ne $info.bestblockhash) { $info.bestblockhash } else { "" }
    }
}

Set-Content -Path $LogFile -Value ""

$Version = Get-WorkspaceVersion
$Binary = Resolve-BinaryPath -Path $Binary
$BinaryVersion = Get-BinaryVersion -Path $Binary

Write-Step "Mainnet readiness"
if ($BinaryVersion -ne 'unknown' -and $BinaryVersion -ne $Version) {
    Write-Warn "Version mismatch: expected $Version, got $BinaryVersion"
} else {
    Write-OK "Binary: $Binary"
    Write-OK "Version: $BinaryVersion"
}

$DocsSummary = @()
Write-Step "Documentation gate"
foreach ($Doc in $Docs) {
    if (-not (Test-Path $Doc)) {
        Write-Fail "Required document missing: $Doc"
    }
    Write-OK "Found $(Split-Path $Doc -Leaf)"
    $DocsSummary += [ordered]@{ path = $Doc; present = $true }
}

if ($RequireApiKeys -and [string]::IsNullOrWhiteSpace($env:KUBERCOIN_API_KEYS)) {
    Write-Fail "KUBERCOIN_API_KEYS is required for this readiness run"
}
if ($RequireApiKeys) {
    Write-OK "API authentication material is present"
}

if (-not $SkipTests) {
    Invoke-LoggedCommand -Description "cargo check --workspace" -Command { cargo check --workspace }
    Invoke-LoggedCommand -Description "cargo test --workspace" -Command { cargo test --workspace }
    if ($Strict) {
        Invoke-LoggedCommand -Description "cargo clippy --workspace --all-targets -- -D warnings" -Command { cargo clippy --workspace --all-targets -- -D warnings }
        if (Get-Command cargo-deny -ErrorAction SilentlyContinue) {
            Invoke-LoggedCommand -Description "cargo deny check" -Command { cargo deny check }
        } else {
            Write-Warn "cargo-deny not installed; skipping deny check"
        }
    }
} else {
    Write-Warn "Skipping workspace tests"
}

$DnsSummary = @()
if (-not $SkipDnsChecks) {
    Write-Step "DNS seed checks"
    foreach ($Seed in $DnsSeed) {
        $resolved = Resolve-DnsSeed -HostName $Seed
        Write-OK "$Seed -> $($resolved -join ',')"
        $DnsSummary += [ordered]@{ host = $Seed; resolved = @($resolved) }
    }
} else {
    Write-Warn "Skipping DNS seed checks"
}

$HardcodedSummary = @()
Write-Step "Hardcoded seed format checks"
foreach ($Seed in $HardcodedSeed) {
    if ($Seed -notmatch '^[^:]+:\d+$') {
        Write-Fail "Hardcoded seed is not in host:port format: $Seed"
    }
    Write-OK $Seed
    $parts = $Seed.Split(':', 2)
    $HardcodedSummary += [ordered]@{ host = $parts[0]; port = [int]$parts[1] }
}

$HttpSummary = @()
if ($SeedHttpUrl.Count -gt 0) {
    Write-Step "Seed HTTP checks"
    foreach ($Url in $SeedHttpUrl) {
        $result = Invoke-SeedHttpCheck -BaseUrl $Url
        Write-OK "$Url responded"
        $HttpSummary += $result
    }
} else {
    Write-Warn "No seed HTTP URLs supplied; skipping live HTTP health checks"
}

Write-Step "Next manual steps"
Write-OK "Use docs/LAUNCH_CHECKLIST.md as the final human gate before announcement"
Write-OK "Use docs/SEED_INFRASTRUCTURE.md to verify operators, alerts, and bootstrap proof"
Write-OK "Use docs/MAINNET_POLICY.md and docs/INCIDENT_RESPONSE.md during launch review"

$Summary = [ordered]@{
    version = $Version
    binary = $Binary
    p2pPort = $P2PPort
    apiPort = $ApiPort
    skipTests = [bool]$SkipTests
    strict = [bool]$Strict
    requireApiKeys = [bool]$RequireApiKeys
    docs = $DocsSummary
    dnsSeeds = $DnsSummary
    hardcodedSeeds = $HardcodedSummary
    seedHttpChecks = $HttpSummary
}

if ($Json) {
    $Summary | ConvertTo-Json -Depth 6
} else {
    Write-Host "Mainnet readiness check complete"
    $Summary | ConvertTo-Json -Depth 6
}

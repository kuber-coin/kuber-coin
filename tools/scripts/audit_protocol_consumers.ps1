param(
    [ValidateSet("table", "json")]
    [string]$Format = "table"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot "..") "..")).Path
$protocolCrates = @("tx", "chain", "consensus", "testnet")
$manifestPaths = @(
    "core/node/Cargo.toml",
    "core/mining/miner/Cargo.toml",
    "core/services/faucet/Cargo.toml",
    "core/services/lightning/Cargo.toml",
    "core/tests/fuzz/Cargo.toml",
    "tools/tx-sender/Cargo.toml"
)

function Get-ProtocolConsumerRecord {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ManifestPath
    )

    $fullPath = Join-Path $repoRoot $ManifestPath
    if (-not (Test-Path $fullPath)) {
        throw "Manifest not found: $ManifestPath"
    }

    $content = Get-Content -LiteralPath $fullPath
    $packageName = $null
    $inDependencies = $false
    $dependencies = @()

    foreach ($line in $content) {
        if (-not $packageName -and $line -match '^name\s*=\s*"([^"]+)"') {
            $packageName = $Matches[1]
        }

        if ($line -match '^\[dependencies\]') {
            $inDependencies = $true
            continue
        }

        if ($line -match '^\[' -and $line -notmatch '^\[dependencies\]') {
            $inDependencies = $false
        }

        if (-not $inDependencies) {
            continue
        }

        if ($line -match '^(tx|chain|consensus|testnet)\s*=\s*\{\s*path\s*=\s*"([^"]+)"') {
            $dependencies += [pscustomobject]@{
                crate = $Matches[1]
                path = $Matches[2]
            }
        }
    }

    return [pscustomobject]@{
        package = $packageName
        manifest = $ManifestPath
        dependencies = $dependencies
    }
}

$results = foreach ($manifestPath in $manifestPaths) {
    Get-ProtocolConsumerRecord -ManifestPath $manifestPath
}

if ($Format -eq "json") {
    $results | ConvertTo-Json -Depth 5
    exit 0
}

$rows = foreach ($result in $results) {
    foreach ($crate in $protocolCrates) {
        $dep = $result.dependencies | Where-Object { $_.crate -eq $crate } | Select-Object -First 1
        [pscustomobject]@{
            Package = $result.package
            Manifest = $result.manifest
            Crate = $crate
            UsesProtocolCrate = $null -ne $dep
            Path = if ($null -ne $dep) { $dep.path } else { "" }
        }
    }
}

$rows | Format-Table -AutoSize
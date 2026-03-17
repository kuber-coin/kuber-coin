param(
    [ValidateSet("table", "json")]
    [string]$Format = "table"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot "..") "..")).Path
$targets = @(
    @{ Name = "node"; Path = "core/node/src" },
    @{ Name = "miner"; Path = "core/mining/miner/src" },
    @{ Name = "faucet"; Path = "core/services/faucet/src" },
    @{ Name = "lightning"; Path = "core/services/lightning/src" }
)
$crateNames = @("tx", "chain", "consensus", "testnet")

$results = foreach ($target in $targets) {
    $fullPath = Join-Path $repoRoot $target.Path
    $files = Get-ChildItem -LiteralPath $fullPath -Recurse -File -Include *.rs

    foreach ($file in $files) {
        $content = Get-Content -LiteralPath $file.FullName -Raw

        foreach ($crate in $crateNames) {
            $pattern = "\b$crate::"
            $count = [regex]::Matches($content, $pattern).Count
            if ($count -gt 0) {
                [pscustomobject]@{
                    Consumer = $target.Name
                    File = $file.FullName.Substring($repoRoot.Length + 1).Replace('\\', '/')
                    Crate = $crate
                    ReferenceCount = $count
                }
            }
        }
    }
}

if ($Format -eq "json") {
    $results | Sort-Object Consumer, File, Crate | ConvertTo-Json -Depth 5
    exit 0
}

$results |
    Sort-Object Consumer, File, Crate |
    Format-Table -AutoSize
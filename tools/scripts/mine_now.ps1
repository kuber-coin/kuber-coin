param(
  [string]$Wallet = "wallet_mine.json",
  [int]$Blocks = 50
)

$ErrorActionPreference = "Stop"

function Write-Section($text){ Write-Host "`n=== $text ===" }
. "$PSScriptRoot\common_build.ps1"

function Ensure-Binary {
  $exePath = (Resolve-Path "target\release\kubercoin-node.exe" -ErrorAction SilentlyContinue)
  if(-not $exePath){
    Write-Host "Building release binary..."
    Invoke-NodeReleaseBuild -WorkspaceRoot (Split-Path -Parent $PSScriptRoot) -StopRunningNode
    $exePath = Resolve-Path "target\release\kubercoin-node.exe"
  }
  return $exePath.Path
}

function Ensure-Wallet($exe, $filename){
  if(-not (Test-Path $filename)){
    & $exe new-wallet $filename | Out-Null
  }
  $addr = & $exe get-address $filename
  return $addr
}

$exe = Ensure-Binary
$env:KUBERCOIN_TEST_MODE = if($env:KUBERCOIN_TEST_MODE){ $env:KUBERCOIN_TEST_MODE } else { 1 }
$env:KUBERCOIN_API_KEYS   = if($env:KUBERCOIN_API_KEYS){ $env:KUBERCOIN_API_KEYS } else { "local-dev-key" }

Write-Section "Preparing wallet"
$address = Ensure-Wallet $exe $Wallet
Write-Host ("Mining to address: {0}" -f $address)

Write-Section ("Start mining {0} blocks" -f $Blocks)
& $exe mine-to $address $Blocks

Write-Section "Balance after mining"
& $exe get-balance $Wallet

Write-Host "`nMining run complete"

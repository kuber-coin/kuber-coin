# KuberCoin Genesis Block Ceremony (Windows)
# Run this ONCE to establish the genesis block and record its hash.

param(
    [string]$Binary = "C:\kubercoin\target\release\kubercoin-node.exe"
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Yellow
Write-Host "  KuberCoin Genesis Block Ceremony"           -ForegroundColor Yellow
Write-Host "  Network: mainnet"                           -ForegroundColor Yellow
Write-Host "  Binary:  $Binary"                           -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host ""

$env:KUBERCOIN_NETWORK = "mainnet"

Write-Host "Mining genesis block with mainnet difficulty (0x1e0fffff)..." -ForegroundColor Cyan
Write-Host "This may take a moment..." -ForegroundColor Cyan
Write-Host ""

$raw = & $Binary mine 1 --json 2>&1
$result = $raw | ConvertFrom-Json

if (-not $result.ok) {
    Write-Host "ERROR: Mining failed" -ForegroundColor Red
    Write-Host $raw
    exit 1
}

$genesis = $result.blocks[0]

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  GENESIS BLOCK CREATED"                      -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  Hash:   $($genesis.hash)"                   -ForegroundColor White
Write-Host "  Height: $($genesis.height)"                 -ForegroundColor White
Write-Host "  Nonce:  $($genesis.nonce)"                  -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Green

$record = [ordered]@{
    network              = "mainnet"
    genesis_hash         = $genesis.hash
    genesis_height       = $genesis.height
    genesis_nonce        = $genesis.nonce
    genesis_message      = "The Times 29/Jan/2026 KuberCoin Genesis"
    genesis_timestamp    = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    difficulty_bits      = "0x1e0fffff"
    block_reward_sat     = 5000000000
    block_reward_kuber   = 50
    max_supply_kuber     = 21000000
    halving_interval     = 210000
    binary_version       = "1.0.0"
    ceremony_host        = $env:COMPUTERNAME
    ceremony_operator    = $env:USERNAME
}

$recordPath = Join-Path $PSScriptRoot "..\genesis_block.json"
$record | ConvertTo-Json -Depth 5 | Set-Content -Path $recordPath -Encoding UTF8

Write-Host ""
Write-Host "Genesis record written to: $recordPath" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Add this hash to node/src/genesis_bootstrap.rs" -ForegroundColor Yellow
Write-Host "           as the mainnet genesis checkpoint."              -ForegroundColor Yellow

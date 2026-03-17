#!/usr/bin/env pwsh
# Test data setup script for KuberCoin e2e tests
# Creates wallets and mines blocks to fund them for transaction tests

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "KuberCoin E2E Test Data Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$NODE_RPC = "http://localhost:3200"
$WALLET_API = "http://localhost:3250/api/wallet"
$BLOCKS_TO_MINE = 110  # Need 100+ for coinbase maturity
$TEST_WALLET_NAME = "test-wallet-e2e"

function Invoke-RPC {
    param(
        [string]$Method,
        [array]$Params = @()
    )
    
    $body = @{
        jsonrpc = "2.0"
        id = 1
        method = $Method
        params = $Params
    } | ConvertTo-Json -Depth 10
    
    try {
        $response = Invoke-RestMethod -Uri "$NODE_RPC/api/rpc" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
        return $response.result
    }
    catch {
        Write-Host "RPC Error ($Method): $_" -ForegroundColor Red
        throw
    }
}

# Step 1: Check node is running
Write-Host "[1/5] Checking node connectivity..." -ForegroundColor Yellow
try {
    $info = Invoke-RPC -Method "getblockchaininfo"
    Write-Host "  OK Node connected - Height: $($info.blocks)" -ForegroundColor Green
}
catch {
    Write-Host "  ERROR Cannot connect to node at $NODE_RPC" -ForegroundColor Red
    Write-Host "  Make sure docker-compose is running: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

# Step 2: Create or get test wallet
Write-Host "[2/5] Setting up test wallet..." -ForegroundColor Yellow
$testAddress = $null
try {
    $walletBody = @{ name = $TEST_WALLET_NAME } | ConvertTo-Json
    $wallet = Invoke-RestMethod -Uri "$WALLET_API/create" -Method Post -Body $walletBody -ContentType "application/json" -TimeoutSec 10
    Write-Host "  OK Created wallet: $TEST_WALLET_NAME" -ForegroundColor Green
    Write-Host "  Address: $($wallet.address)" -ForegroundColor Gray
    $testAddress = $wallet.address
}
catch {
    # Wallet might already exist, try to get it
    Write-Host "  Wallet creation failed, trying existing..." -ForegroundColor Yellow
    try {
        $wallets = Invoke-RestMethod -Uri "$WALLET_API/../wallets" -Method Get -TimeoutSec 10
        $existing = $wallets | Where-Object { $_.name -eq "$TEST_WALLET_NAME.json" } | Select-Object -First 1
        if ($existing) {
            Write-Host "  OK Using existing wallet: $TEST_WALLET_NAME" -ForegroundColor Green
            $balanceResp = Invoke-RestMethod -Uri "$WALLET_API/balance?name=$TEST_WALLET_NAME.json" -Method Get -TimeoutSec 10
            $testAddress = $balanceResp.address
            Write-Host "  Address: $testAddress" -ForegroundColor Gray
        }
        else {
            Write-Host "  ERROR Cannot create or find test wallet" -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Host "  ERROR Wallet API error: $_" -ForegroundColor Red
        exit 1
    }
}

if (-not $testAddress) {
    Write-Host "  ERROR Could not get wallet address" -ForegroundColor Red
    exit 1
}

# Step 3: Check current balance
Write-Host "[3/5] Checking wallet balance..." -ForegroundColor Yellow
try {
    $balance = Invoke-RestMethod -Uri "$WALLET_API/balance?name=$TEST_WALLET_NAME.json" -Method Get -TimeoutSec 10
    $currentBalance = [math]::Floor($balance.spendable)
    Write-Host "  Current balance: $currentBalance sat (spendable)" -ForegroundColor Gray
    
    if ($currentBalance -gt 100000) {
        Write-Host "  OK Wallet already has sufficient funds" -ForegroundColor Green
        Write-Host ""
        Write-Host "Test wallet is ready!" -ForegroundColor Green
        Write-Host "  Name: $TEST_WALLET_NAME" -ForegroundColor Cyan
        Write-Host "  Balance: $currentBalance sat" -ForegroundColor Cyan
        exit 0
    }
}
catch {
    Write-Host "  WARN Could not check balance, will mine blocks anyway" -ForegroundColor Yellow
}

# Step 4: Mine blocks to test wallet
Write-Host "[4/5] Mining $BLOCKS_TO_MINE blocks to $testAddress..." -ForegroundColor Yellow
Write-Host "  This may take 30-60 seconds..." -ForegroundColor Gray

$mineStart = Get-Date
try {
    $result = Invoke-RPC -Method "generatetoaddress" -Params @($BLOCKS_TO_MINE, $testAddress)
    $mineEnd = Get-Date
    $duration = ($mineEnd - $mineStart).TotalSeconds
    
    $blockCount = $result.Count
    Write-Host "  OK Mined $blockCount blocks in $([math]::Round($duration, 1))s" -ForegroundColor Green
}
catch {
    Write-Host "  ERROR Mining failed: $_" -ForegroundColor Red
    exit 1
}

# Step 5: Verify wallet has funds
Write-Host "[5/5] Verifying wallet funds..." -ForegroundColor Yellow
Start-Sleep -Seconds 2  # Give wallet time to sync

try {
    $balance = Invoke-RestMethod -Uri "$WALLET_API/balance?name=$TEST_WALLET_NAME.json" -Method Get -TimeoutSec 10
    $finalBalance = [math]::Floor($balance.spendable)
    $immature = [math]::Floor($balance.immature)
    
    Write-Host "  Spendable: $finalBalance sat" -ForegroundColor Gray
    Write-Host "  Immature: $immature sat" -ForegroundColor Gray
    
    if ($finalBalance -gt 0) {
        Write-Host "  OK Wallet funded successfully!" -ForegroundColor Green
    }
    else {
        Write-Host "  WARN Wallet has immature coins, mine 100+ more blocks for maturity" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "  WARN Could not verify balance" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test wallet details:" -ForegroundColor Cyan
Write-Host "  Name: $TEST_WALLET_NAME" -ForegroundColor White
Write-Host "  Address: $testAddress" -ForegroundColor White
Write-Host ""
Write-Host "You can now run e2e tests:" -ForegroundColor Cyan
Write-Host "  npm test" -ForegroundColor White
Write-Host ""

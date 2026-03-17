param(
  [string]$OutputDir = "reports\wallet_multi_demo",
  [string]$DataDirName = "node_data",
  [long]$AmountB = 1000000,
  [long]$AmountC = 1500000,
  [long]$AmountD = 2000000,
  [int]$FundingBlocks = 120,
  [string]$ApiKey = "public_test_key_not_a_secret",
  [string]$HostName = "127.0.0.1",
  [int]$RpcPort = 29634,
  [int]$RestPort = 29080,
  [int]$P2pPort = 29633,
  [string]$Network = "testnet",
  [int]$StartupTimeoutSec = 20,
  [int]$RpcTimeoutSec = 120,
  [switch]$Json,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common_build.ps1"

function Write-Section($text) {
  Write-Host "`n=== $text ==="
}

function Get-ApiKeyValue([string]$key) {
  if ($key -match '^(Bearer|ApiKey)\s+(.+)$') {
    return $Matches[2]
  }
  return $key
}

function Get-AuthHeader([string]$key) {
  if ([string]::IsNullOrWhiteSpace($key)) {
    return $null
  }
  if ($key -match '^(Bearer|ApiKey)\s') {
    return $key
  }
  return "Bearer $key"
}

function Resolve-DemoBinary {
  $workspaceRoot = Resolve-WorkspaceRoot
  $exePath = Resolve-KubercoinExe -WorkspaceRoot $workspaceRoot
  if (-not $exePath) {
    Write-Host "Building release binary..."
    Invoke-NodeReleaseBuild -WorkspaceRoot $workspaceRoot -StopRunningNode
    $exePath = Resolve-KubercoinExe -WorkspaceRoot $workspaceRoot
  }

  if (-not $exePath) {
    throw "Unable to locate kubercoin-node.exe after build"
  }

  return $exePath
}

function Wait-Port([string]$TargetHost, [int]$Port, [int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = [System.Net.Sockets.TcpClient]::new($TargetHost, $Port)
      if ($client.Connected) {
        $client.Close()
        return $true
      }
    } catch {
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Wait-HttpHealth([string]$TargetHost, [int]$Port, [int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/health" -f $TargetHost, $Port) -TimeoutSec 3
      if ($response.status -eq "ok") {
        return $true
      }
    } catch {
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Invoke-RpcJson {
  param(
    [Parameter(Mandatory = $true)][string]$TargetHost,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$ApiKey,
    [Parameter(Mandatory = $true)][string]$Method,
    $Params = $null
  )

  $headers = @{}
  $authHeader = Get-AuthHeader $ApiKey
  if ($authHeader) {
    $headers.Authorization = $authHeader
  }

  $payloadObject = @{ jsonrpc = "2.0"; method = $Method; id = 1 }
  if ($null -ne $Params) {
    $payloadObject.params = $Params
  }
  $payload = $payloadObject | ConvertTo-Json -Compress -Depth 12

  return Invoke-RestMethod -Method Post -Uri ("http://{0}:{1}/" -f $TargetHost, $Port) -Headers $headers -Body $payload -ContentType "application/json" -TimeoutSec $RpcTimeoutSec
}

function Assert-RpcOk($Response, [string]$Method) {
  if ($null -ne $Response.error) {
    throw "$Method failed: $($Response.error.code) $($Response.error.message)"
  }
}

function Start-DemoNode {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][string]$DataDir,
    [Parameter(Mandatory = $true)][string]$StdOutPath,
    [Parameter(Mandatory = $true)][string]$StdErrPath
  )

  $env:KUBERCOIN_API_KEYS = Get-ApiKeyValue $ApiKey
  $env:KUBERCOIN_API_AUTH_ENABLED = "true"
  $env:KUBERCOIN_TEST_MODE = if ($env:KUBERCOIN_TEST_MODE) { $env:KUBERCOIN_TEST_MODE } else { "1" }

  $commandLine = '--network {0} --data-dir "{1}" --rpc-addr {2}:{3} --rest-addr {4}:{5} --p2p-addr {6}:{7}' -f `
    $Network, $DataDir, $HostName, $RpcPort, $HostName, $RestPort, $HostName, $P2pPort

  return Start-Process -FilePath $Exe -ArgumentList $commandLine -WindowStyle Hidden -RedirectStandardOutput $StdOutPath -RedirectStandardError $StdErrPath -PassThru
}

$workspaceRoot = Resolve-WorkspaceRoot
$exe = Resolve-DemoBinary

$outputRoot = Join-Path $workspaceRoot $OutputDir
$dataDir = Join-Path $outputRoot $DataDirName
$stdoutPath = Join-Path $outputRoot "wallet_multi_demo.out"
$stderrPath = Join-Path $outputRoot "wallet_multi_demo.err"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

foreach ($path in @($dataDir, $stdoutPath, $stderrPath)) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}

if ($Clean) {
  Get-ChildItem -LiteralPath $outputRoot -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '*.json' -or $_.Name -like '*.bin' -or $_.Name -like '*.out' -or $_.Name -like '*.err' } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
}

$walletSpecs = @(
  [pscustomobject]@{ Name = "wallet-demo-a"; Passphrase = "wallet-demo-a-passphrase"; Role = "sender"; Amount = 0 },
  [pscustomobject]@{ Name = "wallet-demo-b"; Passphrase = "wallet-demo-b-passphrase"; Role = "recipient-b"; Amount = $AmountB },
  [pscustomobject]@{ Name = "wallet-demo-c"; Passphrase = "wallet-demo-c-passphrase"; Role = "recipient-c"; Amount = $AmountC },
  [pscustomobject]@{ Name = "wallet-demo-d"; Passphrase = "wallet-demo-d-passphrase"; Role = "recipient-d"; Amount = $AmountD },
  [pscustomobject]@{ Name = "wallet-demo-miner"; Passphrase = "wallet-demo-miner-passphrase"; Role = "miner"; Amount = 0 }
)

$proc = $null

try {
  Write-Section "Start local node"
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  $proc = Start-DemoNode -Exe $exe -DataDir $dataDir -StdOutPath $stdoutPath -StdErrPath $stderrPath

  if (-not (Wait-Port -TargetHost $HostName -Port $RpcPort -TimeoutSec $StartupTimeoutSec)) {
    throw "RPC port $RpcPort did not become ready"
  }
  if (-not (Wait-HttpHealth -TargetHost $HostName -Port $RpcPort -TimeoutSec $StartupTimeoutSec)) {
    throw "HTTP health endpoint on port $RpcPort did not become ready"
  }

  Write-Section "Create wallets"
  $walletResults = @{}
  foreach ($walletSpec in $walletSpecs) {
    $created = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "createwallet" -Params @($walletSpec.Name, $walletSpec.Passphrase)
    Assert-RpcOk -Response $created -Method ("createwallet({0})" -f $walletSpec.Name)
    $walletResults[$walletSpec.Name] = [pscustomobject]@{
      Name = $walletSpec.Name
      Role = $walletSpec.Role
      Passphrase = $walletSpec.Passphrase
      Address = $created.result.address
      TargetAmount = $walletSpec.Amount
    }
    Write-Host ("{0}: {1}" -f $walletSpec.Name, $created.result.address)
  }

  $senderInfo = $walletResults['wallet-demo-a']
  $minerInfo = $walletResults['wallet-demo-miner']
  $recipientInfos = @(
    $walletResults['wallet-demo-b'],
    $walletResults['wallet-demo-c'],
    $walletResults['wallet-demo-d']
  )

  Write-Section "Load and unlock sender wallet"
  $loadedSender = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "loadwallet" -Params @($senderInfo.Name, $senderInfo.Passphrase)
  Assert-RpcOk -Response $loadedSender -Method "loadwallet(sender)"
  $unlockSender = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "walletpassphrase" -Params @($senderInfo.Passphrase, 600)
  Assert-RpcOk -Response $unlockSender -Method "walletpassphrase(sender)"

  Write-Section ("Mine {0} funding blocks to sender" -f $FundingBlocks)
  $mineFunding = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "generatetoaddress" -Params @($FundingBlocks, $senderInfo.Address)
  Assert-RpcOk -Response $mineFunding -Method "generatetoaddress(funding)"
  Write-Host ("Funding blocks mined: {0}" -f @($mineFunding.result).Count)

  Write-Section "Check sender balance before sends"
  $senderBefore = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($senderInfo.Address)
  Assert-RpcOk -Response $senderBefore -Method "getbalance(sender-before)"
  Write-Host ("Sender balance: {0}" -f $senderBefore.result)

  Write-Section "Send funds to B, C, and D"
  $sendResults = @()
  $confirmationHashes = @()
  foreach ($recipientInfo in $recipientInfos) {
    $send = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "sendtoaddress" -Params @($recipientInfo.Address, $recipientInfo.TargetAmount)
    Assert-RpcOk -Response $send -Method ("sendtoaddress({0})" -f $recipientInfo.Name)
    $confirmSend = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "generatetoaddress" -Params @(1, $minerInfo.Address)
    Assert-RpcOk -Response $confirmSend -Method ("generatetoaddress(confirm-{0})" -f $recipientInfo.Name)
    $confirmationHashes += @($confirmSend.result)
    $sendResults += [pscustomobject]@{
      wallet = $recipientInfo.Name
      address = $recipientInfo.Address
      amount = $recipientInfo.TargetAmount
      txid = $send.result.txid
    }
    Write-Host ("{0}: {1}" -f $recipientInfo.Name, $send.result.txid)
  }

  Write-Section "Check balances after sends"
  $senderAfter = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($senderInfo.Address)
  Assert-RpcOk -Response $senderAfter -Method "getbalance(sender-after)"

  $recipientBalances = foreach ($recipientInfo in $recipientInfos) {
    $balance = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($recipientInfo.Address)
    Assert-RpcOk -Response $balance -Method ("getbalance({0})" -f $recipientInfo.Name)
    [pscustomobject]@{
      wallet = $recipientInfo.Name
      address = $recipientInfo.Address
      amount = $balance.result
    }
  }

  $minerAfter = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($minerInfo.Address)
  Assert-RpcOk -Response $minerAfter -Method "getbalance(miner-after)"

  $summary = [pscustomobject]@{
    outputRoot = $outputRoot
    dataDir = $dataDir
    rpcUrl = "http://$HostName`:$RpcPort/"
    sender = [pscustomobject]@{
      wallet = $senderInfo.Name
      address = $senderInfo.Address
      before = $senderBefore.result
      after = $senderAfter.result
    }
    recipients = $recipientBalances
    sends = $sendResults
    miner = [pscustomobject]@{
      wallet = $minerInfo.Name
      address = $minerInfo.Address
      after = $minerAfter.result
    }
    confirmationBlocks = $confirmationHashes.Count
    confirmationHashes = $confirmationHashes
    logs = [pscustomobject]@{
      stdout = $stdoutPath
      stderr = $stderrPath
    }
  }

  if ($Json) {
    $summary | ConvertTo-Json -Depth 6
  } else {
    Write-Host ("Sender before: {0}" -f $senderBefore.result)
    Write-Host ("Sender after:  {0}" -f $senderAfter.result)
    foreach ($recipientBalance in $recipientBalances) {
      Write-Host ("{0}: {1}" -f $recipientBalance.wallet, $recipientBalance.amount)
    }
    Write-Host ("Miner after:   {0}" -f $minerAfter.result)
    Write-Host "`nMulti-wallet demo complete"
    Write-Host ($summary | ConvertTo-Json -Depth 6)
  }
}
finally {
  if ($proc) {
    try {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }
}
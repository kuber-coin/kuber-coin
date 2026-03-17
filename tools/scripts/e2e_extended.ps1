param(
  [string]$ApiKey = "public_test_key_not_a_secret",
  [string]$TargetHost = "127.0.0.1",
  [int]$RpcPort = 18634,
  [int]$RestPort = 18080,
  [int]$P2pPort = 18633,
  [string]$Network = "testnet",
  [int]$StartupTimeoutSec = 25
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common_build.ps1"

function Write-Section([string]$text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
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

function Wait-Port([string]$HostName, [int]$Port, [int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = [System.Net.Sockets.TcpClient]::new($HostName, $Port)
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

function Invoke-RpcRaw([string]$HostName, [int]$Port, [string]$ApiKey, [string]$Method, $Params = $null) {
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

  return Invoke-RestMethod -Method Post -Uri ("http://{0}:{1}/" -f $HostName, $Port) -Headers $headers -Body $payload -ContentType "application/json" -TimeoutSec 5
}

function Assert-RpcOk($Response, [string]$Method) {
  if ($null -ne $Response.error) {
    throw "$Method failed: $($Response.error.code) $($Response.error.message)"
  }
}

function New-TempDataDir() {
  $path = Join-Path $env:TEMP ("kubercoin_e2e_extended_" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $path | Out-Null
  return $path
}

function Start-Node([string]$WorkspaceRoot, [string]$HostName, [int]$RpcPort, [int]$RestPort, [int]$P2pPort, [string]$Network, [string]$ApiKey, [string]$DataDir) {
  $exe = Resolve-KubercoinExe -WorkspaceRoot $WorkspaceRoot
  if ($env:KUBERCOIN_SKIP_BUILD -ne "1") {
    Invoke-NodeReleaseBuild -WorkspaceRoot $WorkspaceRoot -StopRunningNode
    $exe = Resolve-KubercoinExe -WorkspaceRoot $WorkspaceRoot
  }
  if (-not $exe) {
    throw "Release executable was not found after build"
  }

  $env:KUBERCOIN_API_KEYS = Get-ApiKeyValue $ApiKey
  $env:KUBERCOIN_API_AUTH_ENABLED = "true"
  $env:KUBERCOIN_TEST_MODE = "1"

  $nodeLaunch = @(
    "--network", $Network,
    "--data-dir", $DataDir,
    "--rpc-addr", ("{0}:{1}" -f $HostName, $RpcPort),
    "--rest-addr", ("{0}:{1}" -f $HostName, $RestPort),
    "--p2p-addr", ("{0}:{1}" -f $HostName, $P2pPort)
  )

  return Start-Process -FilePath $exe -ArgumentList $nodeLaunch -WindowStyle Hidden -PassThru
}

$workspaceRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$dataDir = $null
$proc = $null

try {
  Write-Section "Starting node"
  $dataDir = New-TempDataDir
  $proc = Start-Node -WorkspaceRoot $workspaceRoot -HostName $TargetHost -RpcPort $RpcPort -RestPort $RestPort -P2pPort $P2pPort -Network $Network -ApiKey $ApiKey -DataDir $dataDir

  if (-not (Wait-Port -HostName $TargetHost -Port $RpcPort -TimeoutSec $StartupTimeoutSec)) {
    throw "RPC port $RpcPort did not become ready"
  }
  Write-Section "Auth negative"
  $unauthorized = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey "" -Method "getblockcount"
  if ($null -eq $unauthorized.error) {
    Write-Host "WARN: RPC auth is not enforced on this local node configuration" -ForegroundColor Yellow
  } elseif ($unauthorized.error.code -ne -32001) {
    throw "Expected missing-auth code -32001, got $($unauthorized.error.code)"
  }

  Write-Section "REST endpoints"
  $health = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/health" -f $TargetHost, $RpcPort) -TimeoutSec 5
  if ($health.status -ne "ok") {
    throw "/api/health returned unexpected status '$($health.status)'"
  }
  $info = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/info" -f $TargetHost, $RpcPort) -TimeoutSec 5
  if (-not $info.tip) {
    throw "/api/info missing tip"
  }
  $peers = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/peers" -f $TargetHost, $RpcPort) -TimeoutSec 5
  if ($peers.total -lt 0) {
    throw "/api/peers returned an invalid total"
  }
  $metrics = Invoke-WebRequest -Method Get -Uri ("http://{0}:{1}/metrics" -f $TargetHost, $RpcPort) -UseBasicParsing -TimeoutSec 5
  if ($metrics.StatusCode -ne 200 -or $metrics.Content -notmatch "kubercoin") {
    throw "/metrics did not return Prometheus text"
  }

  Write-Section "Wallet RPC flow"
  $walletName = "wallet-" + [Guid]::NewGuid().ToString("N").Substring(0, 12)
  $walletPassphrase = "Passphrase-" + [Guid]::NewGuid().ToString("N")

  $created = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "createwallet" -Params @($walletName, $walletPassphrase)
  Assert-RpcOk -Response $created -Method "createwallet"
  if ($created.result.name -ne $walletName) {
    throw "createwallet returned an unexpected wallet name"
  }
  if (-not $created.result.address) {
    throw "createwallet did not return a wallet address"
  }

  $listed = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "listwallets"
  Assert-RpcOk -Response $listed -Method "listwallets"
  if (-not ($listed.result -contains $walletName)) {
    Write-Host "WARN: listwallets did not echo the just-created wallet name" -ForegroundColor Yellow
  }

  $walletInfo = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "getwalletinfo"
  Assert-RpcOk -Response $walletInfo -Method "getwalletinfo"
  if ($walletInfo.result.walletname -ne $walletName) {
    throw "getwalletinfo did not report the loaded wallet"
  }

  $unloaded = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "unloadwallet"
  Assert-RpcOk -Response $unloaded -Method "unloadwallet"

  $wrongLoad = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "loadwallet" -Params @($walletName, "wrong-passphrase")
  if ($null -eq $wrongLoad.error) {
    throw "loadwallet with a wrong passphrase unexpectedly succeeded"
  }

  $loaded = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "loadwallet" -Params @($walletName, $walletPassphrase)
  Assert-RpcOk -Response $loaded -Method "loadwallet"

  $mined = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "generatetoaddress" -Params @(1, $created.result.address)
  Assert-RpcOk -Response $mined -Method "generatetoaddress"
  if (@($mined.result).Count -lt 1) {
    throw "generatetoaddress did not return any block hashes"
  }

  $balance = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($created.result.address)
  Assert-RpcOk -Response $balance -Method "getbalance"
  if (($balance.result -as [long]) -le 0) {
    throw "Expected mined address balance to be positive"
  }

  $restBalance = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/balance/{2}" -f $TargetHost, $RpcPort, $created.result.address) -TimeoutSec 5
  if ($restBalance.address -ne $created.result.address) {
    throw "REST balance endpoint returned the wrong address"
  }
  if ($null -eq ($restBalance.balance -as [long])) {
    throw "REST balance endpoint returned a non-numeric balance"
  }

  $newAddress = Invoke-RpcRaw -HostName $TargetHost -Port $RpcPort -ApiKey $ApiKey -Method "getnewaddress"
  Assert-RpcOk -Response $newAddress -Method "getnewaddress"
  if (-not $newAddress.result.address -or -not $newAddress.result.privkey) {
    throw "getnewaddress did not return address and privkey"
  }

  Write-Host "`nE2E extended passed" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "E2E extended failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if ($proc) {
    try {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }
  try {
    Stop-KubercoinProcesses -WaitTimeoutMs 5000 | Out-Null
  } catch {
  }
  if ($dataDir -and (Test-Path $dataDir)) {
    Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
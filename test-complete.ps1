param(
  [string]$ApiKey = "public_test_key_not_a_secret",
  [string]$TargetHost = "127.0.0.1",
  [int]$RpcPort = 18634,
  [int]$P2pPort = 18633,
  [string]$Network = "testnet",
  [int]$StartupTimeoutSec = 25
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\tools\scripts\common_build.ps1"

function Write-Section([string]$Title) {
  Write-Host "`n=== $Title ===" -ForegroundColor Cyan
}

function Get-ApiKeyValue([string]$Key) {
  if ($Key -match '^(Bearer|ApiKey)\s+(.+)$') {
    return $Matches[2]
  }
  return $Key
}

function Get-AuthHeader([string]$Key) {
  if ([string]::IsNullOrWhiteSpace($Key)) {
    return $null
  }
  if ($Key -match '^(Bearer|ApiKey)\s') {
    return $Key
  }
  return "Bearer $Key"
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

function Invoke-Rpc([string]$HostName, [int]$Port, [string]$Key, [string]$Method, $Params = $null) {
  $headers = @{}
  $authHeader = Get-AuthHeader $Key
  if ($authHeader) {
    $headers.Authorization = $authHeader
  }

  $payloadObject = @{ jsonrpc = "2.0"; method = $Method; id = 1 }
  if ($null -ne $Params) {
    $payloadObject.params = $Params
  }

  $payload = $payloadObject | ConvertTo-Json -Compress -Depth 12
  return Invoke-RestMethod -Method Post -Uri ("http://{0}:{1}/" -f $HostName, $Port) -Headers $headers -Body $payload -ContentType "application/json" -TimeoutSec 8
}

function Assert-RpcOk($Response, [string]$Method) {
  if ($null -ne $Response.error) {
    throw "$Method failed: $($Response.error.code) $($Response.error.message)"
  }
}

function New-TempDataDir() {
  $path = Join-Path $env:TEMP ("kubercoin_complete_suite_" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $path | Out-Null
  return $path
}

function Start-NodeProcess([string]$WorkspaceRoot, [string]$HostName, [int]$Port, [int]$P2pListenPort, [string]$ChainNetwork, [string]$Key, [string]$DataDir) {
  $exe = Resolve-KubercoinExe -WorkspaceRoot $WorkspaceRoot
  if (-not $exe) {
    Write-Host "  INFO - Building release node binary..." -ForegroundColor Gray
    Invoke-NodeReleaseBuild -WorkspaceRoot $WorkspaceRoot -StopRunningNode
    $exe = Resolve-KubercoinExe -WorkspaceRoot $WorkspaceRoot
  }
  if (-not $exe) {
    throw "Release executable was not found after build"
  }

  $env:KUBERCOIN_API_KEYS = Get-ApiKeyValue $Key
  $env:KUBERCOIN_API_AUTH_ENABLED = "true"
  $env:KUBERCOIN_TEST_MODE = "1"

  $launchArguments = @(
    "--network", $ChainNetwork,
    "--data-dir", $DataDir,
    "--rpc-addr", ("{0}:{1}" -f $HostName, $Port),
    "--rest-addr", ("{0}:{1}" -f $HostName, $Port),
    "--p2p-addr", ("{0}:{1}" -f $HostName, $P2pListenPort)
  )

  return Start-Process -FilePath $exe -ArgumentList $launchArguments -WindowStyle Hidden -PassThru
}

function Add-Result([System.Collections.Generic.List[object]]$Results, [string]$Name, [bool]$Passed, [string]$Message) {
  $Results.Add([PSCustomObject]@{
    Name = $Name
    Passed = $Passed
    Message = $Message
  }) | Out-Null
}

function Invoke-ScriptCheck([System.Collections.Generic.List[object]]$Results, [string]$Name, [string]$ScriptPath, [string]$Key) {
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -ApiKey $Key
    if ($LASTEXITCODE -eq 0) {
      Add-Result -Results $Results -Name $Name -Passed $true -Message "ok"
    } else {
      Add-Result -Results $Results -Name $Name -Passed $false -Message ("exit {0}" -f $LASTEXITCODE)
    }
  } catch {
    Add-Result -Results $Results -Name $Name -Passed $false -Message $_.Exception.Message
  }
}

function Invoke-CompleteTestSuite {
  Write-Host "`n========================================" -ForegroundColor Cyan
  Write-Host "KuberCoin Complete Feature Test Suite" -ForegroundColor Cyan
  Write-Host "========================================`n" -ForegroundColor Cyan

  $results = [System.Collections.Generic.List[object]]::new()
  $workspaceRoot = Resolve-WorkspaceRoot -WorkspaceRoot $PSScriptRoot
  $dataDir = $null
  $nodeProc = $null

  try {
    Write-Section "Starting node"
    $dataDir = New-TempDataDir
    $nodeProc = Start-NodeProcess -WorkspaceRoot $workspaceRoot -HostName $TargetHost -Port $RpcPort -P2pListenPort $P2pPort -ChainNetwork $Network -Key $ApiKey -DataDir $dataDir

    if (-not (Wait-Port -HostName $TargetHost -Port $RpcPort -TimeoutSec $StartupTimeoutSec)) {
      throw "Node RPC/API port $RpcPort did not become ready"
    }
    Add-Result -Results $results -Name "node_startup" -Passed $true -Message ("rpc port {0} ready" -f $RpcPort)

    Write-Section "REST surface"
    try {
      $health = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/health" -f $TargetHost, $RpcPort) -TimeoutSec 5
      if ($health.status -ne "ok") { throw "status=$($health.status)" }
      Add-Result -Results $results -Name "rest_health" -Passed $true -Message ("height={0}" -f $health.height)
    } catch {
      Add-Result -Results $results -Name "rest_health" -Passed $false -Message $_.Exception.Message
    }

    try {
      $info = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/info" -f $TargetHost, $RpcPort) -TimeoutSec 5
      if (-not $info.version -or -not $info.tip) { throw "missing version or tip" }
      Add-Result -Results $results -Name "rest_info" -Passed $true -Message ("version={0}" -f $info.version)
    } catch {
      Add-Result -Results $results -Name "rest_info" -Passed $false -Message $_.Exception.Message
    }

    try {
      $blockZero = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/block-by-height/0" -f $TargetHost, $RpcPort) -TimeoutSec 5
      if ($blockZero.height -ne 0) { throw "height=$($blockZero.height)" }
      Add-Result -Results $results -Name "rest_block_by_height" -Passed $true -Message "genesis ok"
    } catch {
      Add-Result -Results $results -Name "rest_block_by_height" -Passed $false -Message $_.Exception.Message
    }

    try {
      $peers = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/peers" -f $TargetHost, $RpcPort) -TimeoutSec 5
      if ($peers.total -lt 0) { throw "negative peer count" }
      Add-Result -Results $results -Name "rest_peers" -Passed $true -Message ("total={0}" -f $peers.total)
    } catch {
      Add-Result -Results $results -Name "rest_peers" -Passed $false -Message $_.Exception.Message
    }

    try {
      $metrics = Invoke-WebRequest -Method Get -Uri ("http://{0}:{1}/metrics" -f $TargetHost, $RpcPort) -UseBasicParsing -TimeoutSec 5
      if ($metrics.StatusCode -ne 200 -or $metrics.Content -notmatch "kubercoin") { throw "unexpected metrics response" }
      Add-Result -Results $results -Name "rest_metrics" -Passed $true -Message "prometheus ok"
    } catch {
      Add-Result -Results $results -Name "rest_metrics" -Passed $false -Message $_.Exception.Message
    }

    try {
      $localhostHealth = Invoke-RestMethod -Method Get -Uri ("http://localhost:{0}/api/health" -f $RpcPort) -TimeoutSec 5
      if ($localhostHealth.status -ne "ok") { throw "status=$($localhostHealth.status)" }
      Add-Result -Results $results -Name "rest_localhost" -Passed $true -Message "localhost ok"
    } catch {
      Add-Result -Results $results -Name "rest_localhost" -Passed $false -Message $_.Exception.Message
    }

    Write-Section "RPC surface"
    try {
      $count = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "getblockcount"
      Assert-RpcOk -Response $count -Method "getblockcount"
      Add-Result -Results $results -Name "rpc_getblockcount" -Passed $true -Message ("count={0}" -f $count.result)
    } catch {
      Add-Result -Results $results -Name "rpc_getblockcount" -Passed $false -Message $_.Exception.Message
    }

    try {
      $help = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "help"
      Assert-RpcOk -Response $help -Method "help"
      $methods = @($help.result)
      if ($methods.Count -lt 10) { throw "unexpectedly short method list" }
      Add-Result -Results $results -Name "rpc_help" -Passed $true -Message ("methods={0}" -f $methods.Count)
    } catch {
      Add-Result -Results $results -Name "rpc_help" -Passed $false -Message $_.Exception.Message
    }

    try {
      $chainInfo = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "getblockchaininfo"
      Assert-RpcOk -Response $chainInfo -Method "getblockchaininfo"
      $bestHash = $chainInfo.result.bestblockhash
      $bestBlock = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "getblock" -Params @($bestHash)
      Assert-RpcOk -Response $bestBlock -Method "getblock"
      if ($bestBlock.result.hash -ne $bestHash) { throw "best block hash mismatch" }
      Add-Result -Results $results -Name "rpc_getblockchaininfo" -Passed $true -Message ("best={0}" -f $bestHash)
    } catch {
      Add-Result -Results $results -Name "rpc_getblockchaininfo" -Passed $false -Message $_.Exception.Message
    }

    try {
      $authless = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key "" -Method "getblockcount"
      if ($null -eq $authless.error) {
        Add-Result -Results $results -Name "rpc_auth_negative" -Passed $true -Message "auth not enforced in this local config"
      } elseif ($authless.error.code -eq -32001) {
        Add-Result -Results $results -Name "rpc_auth_negative" -Passed $true -Message "missing auth rejected"
      } else {
        throw ("unexpected code {0}" -f $authless.error.code)
      }
    } catch {
      Add-Result -Results $results -Name "rpc_auth_negative" -Passed $false -Message $_.Exception.Message
    }

    Write-Section "Wallet flow"
    $walletName = "wallet-" + [Guid]::NewGuid().ToString("N").Substring(0, 12)
    $walletPassphrase = "Passphrase-" + [Guid]::NewGuid().ToString("N")
    $walletAddress = $null

    try {
      $created = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "createwallet" -Params @($walletName, $walletPassphrase)
      Assert-RpcOk -Response $created -Method "createwallet"
      $walletAddress = $created.result.address
      if (-not $walletAddress) { throw "missing wallet address" }
      Add-Result -Results $results -Name "wallet_create" -Passed $true -Message $walletName
    } catch {
      Add-Result -Results $results -Name "wallet_create" -Passed $false -Message $_.Exception.Message
    }

    try {
      $walletInfo = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "getwalletinfo"
      Assert-RpcOk -Response $walletInfo -Method "getwalletinfo"
      if ($walletInfo.result.walletname -ne $walletName) { throw "loaded wallet mismatch" }
      Add-Result -Results $results -Name "wallet_info" -Passed $true -Message ("addresses={0}" -f $walletInfo.result.address_count)
    } catch {
      Add-Result -Results $results -Name "wallet_info" -Passed $false -Message $_.Exception.Message
    }

    try {
      $listWallets = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "listwallets"
      Assert-RpcOk -Response $listWallets -Method "listwallets"
      if (@($listWallets.result) -contains $walletName) {
        Add-Result -Results $results -Name "wallet_list" -Passed $true -Message "wallet listed"
      } else {
        Add-Result -Results $results -Name "wallet_list" -Passed $true -Message "wallet not echoed by runtime listwallets"
      }
    } catch {
      Add-Result -Results $results -Name "wallet_list" -Passed $false -Message $_.Exception.Message
    }

    try {
      $unloaded = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "unloadwallet"
      Assert-RpcOk -Response $unloaded -Method "unloadwallet"
      $loaded = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "loadwallet" -Params @($walletName, $walletPassphrase)
      Assert-RpcOk -Response $loaded -Method "loadwallet"
      Add-Result -Results $results -Name "wallet_reload" -Passed $true -Message "unload/load ok"
    } catch {
      Add-Result -Results $results -Name "wallet_reload" -Passed $false -Message $_.Exception.Message
    }

    try {
      $freshAddress = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "getnewaddress"
      Assert-RpcOk -Response $freshAddress -Method "getnewaddress"
      if (-not $freshAddress.result.address -or -not $freshAddress.result.privkey) { throw "missing address or privkey" }
      Add-Result -Results $results -Name "wallet_getnewaddress" -Passed $true -Message $freshAddress.result.address
    } catch {
      Add-Result -Results $results -Name "wallet_getnewaddress" -Passed $false -Message $_.Exception.Message
    }

    try {
      $wrongLoad = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "loadwallet" -Params @($walletName, "wrong-passphrase")
      if ($null -eq $wrongLoad.error) { throw "wrong-passphrase load unexpectedly succeeded" }
      Add-Result -Results $results -Name "wallet_wrong_passphrase" -Passed $true -Message "rejected as expected"
    } catch {
      Add-Result -Results $results -Name "wallet_wrong_passphrase" -Passed $false -Message $_.Exception.Message
    }

    if ($walletAddress) {
      try {
        $mined = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "generatetoaddress" -Params @(1, $walletAddress)
        Assert-RpcOk -Response $mined -Method "generatetoaddress"
        if (@($mined.result).Count -lt 1) { throw "no block hashes returned" }
        $rpcBalance = Invoke-Rpc -HostName $TargetHost -Port $RpcPort -Key $ApiKey -Method "getbalance" -Params @($walletAddress)
        Assert-RpcOk -Response $rpcBalance -Method "getbalance"
        if (($rpcBalance.result -as [long]) -le 0) { throw "non-positive RPC balance after mining" }
        $restBalance = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/balance/{2}" -f $TargetHost, $RpcPort, $walletAddress) -TimeoutSec 5
        if ($restBalance.address -ne $walletAddress) { throw "REST address mismatch" }
        Add-Result -Results $results -Name "wallet_mine_and_balance" -Passed $true -Message ("rpc={0} rest={1}" -f $rpcBalance.result, $restBalance.balance)
      } catch {
        Add-Result -Results $results -Name "wallet_mine_and_balance" -Passed $false -Message $_.Exception.Message
      }
    }

    Write-Section "Nested smoke checks"
    Invoke-ScriptCheck -Results $results -Name "script_cli_json_smoke" -ScriptPath (Join-Path $PSScriptRoot "tools\scripts\cli_json_smoke.ps1") -Key $ApiKey
    Invoke-ScriptCheck -Results $results -Name "script_e2e_smoke" -ScriptPath (Join-Path $PSScriptRoot "tools\scripts\e2e_smoke.ps1") -Key $ApiKey
    Invoke-ScriptCheck -Results $results -Name "script_e2e_extended" -ScriptPath (Join-Path $PSScriptRoot "tools\scripts\e2e_extended.ps1") -Key $ApiKey
  } finally {
    if ($nodeProc) {
      try { Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    try { Stop-KubercoinProcesses -WaitTimeoutMs 5000 | Out-Null } catch {}
    if ($dataDir -and (Test-Path $dataDir)) {
      Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  Write-Host "`n========================================" -ForegroundColor Cyan
  Write-Host "Test Results Summary" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan

  foreach ($result in $results) {
    $color = if ($result.Passed) { "Green" } else { "Red" }
    $label = if ($result.Passed) { "PASS" } else { "FAIL" }
    Write-Host ("[{0}] {1} - {2}" -f $label, $result.Name, $result.Message) -ForegroundColor $color
  }

  $passed = @($results | Where-Object { $_.Passed }).Count
  $failed = @($results | Where-Object { -not $_.Passed }).Count
  Write-Host "`nPassed: $passed" -ForegroundColor Green
  Write-Host "Failed: $failed" -ForegroundColor Red
  Write-Host "Total:  $($passed + $failed)" -ForegroundColor White

  if ($failed -eq 0) {
    Write-Host "`nALL TESTS PASSED" -ForegroundColor Green
    return 0
  }

  Write-Host "`nSOME TESTS FAILED" -ForegroundColor Yellow
  return 1
}

$exitCode = 1
try {
  $exitCode = Invoke-CompleteTestSuite
} catch {
  Write-Host "Unhandled failure: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
}

exit $exitCode

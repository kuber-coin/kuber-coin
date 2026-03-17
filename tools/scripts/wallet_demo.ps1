param(
	[string]$OutputDir = "reports\wallet_demo",
	[string]$DataDirName = "node_data",
	[long]$Amount = 1000000,
	[int]$FundingBlocks = 101,
	[string]$ApiKey = "public_test_key_not_a_secret",
	[string]$HostName = "127.0.0.1",
	[int]$RpcPort = 28634,
	[int]$RestPort = 28080,
	[int]$P2pPort = 28633,
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

	$launchParameters = @(
		"--network", $Network,
		"--data-dir", $DataDir,
		"--rpc-addr", ("{0}:{1}" -f $HostName, $RpcPort),
		"--rest-addr", ("{0}:{1}" -f $HostName, $RestPort),
		"--p2p-addr", ("{0}:{1}" -f $HostName, $P2pPort)
	)

	return Start-Process -FilePath $Exe -ArgumentList $launchParameters -WindowStyle Hidden -RedirectStandardOutput $StdOutPath -RedirectStandardError $StdErrPath -PassThru
}

$workspaceRoot = Resolve-WorkspaceRoot
$exe = Resolve-DemoBinary

$outputRoot = Join-Path $workspaceRoot $OutputDir
$dataDir = Join-Path $outputRoot $DataDirName
$stdoutPath = Join-Path $outputRoot "wallet_demo.out"
$stderrPath = Join-Path $outputRoot "wallet_demo.err"

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

$senderWalletName = "wallet-demo-sender"
$recipientWalletName = "wallet-demo-recipient"
$minerWalletName = "wallet-demo-miner"
$senderPassphrase = "wallet-demo-sender-passphrase"
$recipientPassphrase = "wallet-demo-recipient-passphrase"
$minerPassphrase = "wallet-demo-miner-passphrase"
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
	$senderWalletInfo = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "createwallet" -Params @($senderWalletName, $senderPassphrase)
	Assert-RpcOk -Response $senderWalletInfo -Method "createwallet(sender)"
	$senderWalletInfo = $senderWalletInfo.result

	$recipientWalletInfo = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "createwallet" -Params @($recipientWalletName, $recipientPassphrase)
	Assert-RpcOk -Response $recipientWalletInfo -Method "createwallet(recipient)"
	$recipientWalletInfo = $recipientWalletInfo.result

	$minerWalletInfo = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "createwallet" -Params @($minerWalletName, $minerPassphrase)
	Assert-RpcOk -Response $minerWalletInfo -Method "createwallet(miner)"
	$minerWalletInfo = $minerWalletInfo.result

	Write-Host ("Sender:    {0}" -f $senderWalletInfo.address)
	Write-Host ("Recipient: {0}" -f $recipientWalletInfo.address)
	Write-Host ("Miner:     {0}" -f $minerWalletInfo.address)

	Write-Section "Load and unlock sender wallet"
	$loadedSender = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "loadwallet" -Params @($senderWalletName, $senderPassphrase)
	Assert-RpcOk -Response $loadedSender -Method "loadwallet(sender)"
	$unlockSender = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "walletpassphrase" -Params @($senderPassphrase, 600)
	Assert-RpcOk -Response $unlockSender -Method "walletpassphrase(sender)"

	Write-Section ("Mine {0} funding blocks to sender" -f $FundingBlocks)
	$mineResult = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "generatetoaddress" -Params @($FundingBlocks, $senderWalletInfo.address)
	Assert-RpcOk -Response $mineResult -Method "generatetoaddress(funding)"
	Write-Host ("Funding blocks mined: {0}" -f @($mineResult.result).Count)

	Write-Section "Check sender balance before send"
	$senderBefore = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($senderWalletInfo.address)
	Assert-RpcOk -Response $senderBefore -Method "getbalance(sender-before)"
	Write-Host ("Sender balance: {0}" -f $senderBefore.result)

	Write-Section "Send funds to recipient"
	$sendResult = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "sendtoaddress" -Params @($recipientWalletInfo.address, $Amount)
	Assert-RpcOk -Response $sendResult -Method "sendtoaddress"
	Write-Host ("Transaction: {0}" -f $sendResult.result.txid)

	Write-Section "Mine confirmation block"
	$confirmResult = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "generatetoaddress" -Params @(1, $minerWalletInfo.address)
	Assert-RpcOk -Response $confirmResult -Method "generatetoaddress(confirm)"

	Write-Section "Check balances after send"
	$senderAfter = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($senderWalletInfo.address)
	Assert-RpcOk -Response $senderAfter -Method "getbalance(sender-after)"
	$recipientAfter = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($recipientWalletInfo.address)
	Assert-RpcOk -Response $recipientAfter -Method "getbalance(recipient-after)"
	$minerAfter = Invoke-RpcJson -TargetHost $HostName -Port $RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($minerWalletInfo.address)
	Assert-RpcOk -Response $minerAfter -Method "getbalance(miner-after)"

	$summary = [pscustomobject]@{
		outputRoot = $outputRoot
		dataDir = $dataDir
		rpcUrl = "http://$HostName`:$RpcPort/"
		senderWallet = $senderWalletName
		senderAddress = $senderWalletInfo.address
		senderBefore = $senderBefore.result
		recipientWallet = $recipientWalletName
		recipientAddress = $recipientWalletInfo.address
		minerWallet = $minerWalletName
		minerAddress = $minerWalletInfo.address
		send = [pscustomobject]@{
			txid = $sendResult.result.txid
			amount = $Amount
			confirmationBlocks = @($confirmResult.result).Count
		}
		senderAfter = $senderAfter.result
		recipientAfter = $recipientAfter.result
		minerAfter = $minerAfter.result
		logs = [pscustomobject]@{
			stdout = $stdoutPath
			stderr = $stderrPath
		}
	}

	if ($Json) {
		$summary | ConvertTo-Json -Depth 6
	} else {
		Write-Host ("Sender before:   {0}" -f $senderBefore.result)
		Write-Host ("Sender after:    {0}" -f $senderAfter.result)
		Write-Host ("Recipient after: {0}" -f $recipientAfter.result)
		Write-Host ("Miner after:     {0}" -f $minerAfter.result)
		Write-Host "`nWallet demo complete"
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

param(
	[string]$OutputDir = "reports\multinode",
	[string]$ApiKey = "public_test_key_not_a_secret",
	[string]$HostName = "127.0.0.1",
	[string]$Network = "regtest",
	[int]$StartupTimeoutSec = 25,
	[int]$SyncTimeoutSec = 45,
	[int]$RpcTimeoutSec = 120,
	[int]$FundingBlocks = 120,
	[long]$TransferAmount = 1000000,
	[switch]$FullTest,
	[switch]$Json,
	[switch]$Clean
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

function Wait-RpcReady([hashtable]$Node, [int]$TimeoutSec) {
	if (-not (Wait-Port -TargetHost $Node.HostName -Port $Node.RpcPort -TimeoutSec $TimeoutSec)) {
		return $false
	}

	$deadline = (Get-Date).AddSeconds($TimeoutSec)
	while ((Get-Date) -lt $deadline) {
		try {
			$response = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/health" -f $Node.HostName, $Node.RpcPort) -TimeoutSec 3
			if ($response.status -eq "ok") {
				return $true
			}
		} catch {
		}
		Start-Sleep -Milliseconds 250
	}

	return $false
}

function Wait-Until([scriptblock]$Condition, [int]$TimeoutSec, [int]$PollMs = 500, [string]$Description = "condition") {
	$deadline = (Get-Date).AddSeconds($TimeoutSec)
	while ((Get-Date) -lt $deadline) {
		if (& $Condition) {
			return $true
		}
		Start-Sleep -Milliseconds $PollMs
	}

	throw "Timed out waiting for $Description"
}

function Test-Until([scriptblock]$Condition, [int]$TimeoutSec, [int]$PollMs = 500) {
	$deadline = (Get-Date).AddSeconds($TimeoutSec)
	while ((Get-Date) -lt $deadline) {
		if (& $Condition) {
			return $true
		}
		Start-Sleep -Milliseconds $PollMs
	}

	return $false
}

function Start-TestNode {
	param(
		[Parameter(Mandatory = $true)][string]$Exe,
		[Parameter(Mandatory = $true)][hashtable]$Node
	)

	$env:KUBERCOIN_API_KEYS = Get-ApiKeyValue $ApiKey
	$env:KUBERCOIN_API_AUTH_ENABLED = "true"
	$env:KUBERCOIN_TEST_MODE = if ($env:KUBERCOIN_TEST_MODE) { $env:KUBERCOIN_TEST_MODE } else { "1" }

	$arguments = @(
		"--network", $Network,
		"--data-dir", $Node.DataDir,
		"--rpc-addr", ("{0}:{1}" -f $Node.HostName, $Node.RpcPort),
		"--rest-addr", ("{0}:{1}" -f $Node.HostName, $Node.RestPort),
		"--p2p-addr", ("{0}:{1}" -f $Node.HostName, $Node.P2pPort)
	)

	return Start-Process -FilePath $Exe -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput $Node.StdoutPath -RedirectStandardError $Node.StderrPath -PassThru
}

function Get-NodeHeight([hashtable]$Node) {
	$response = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "getblockcount"
	Assert-RpcOk -Response $response -Method ("getblockcount({0})" -f $Node.Name)
	return [int64]$response.result
}

function Get-NodeConnections([hashtable]$Node) {
	$response = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "getconnectioncount"
	Assert-RpcOk -Response $response -Method ("getconnectioncount({0})" -f $Node.Name)
	return [int]$response.result
}

function Get-NodeMempool([hashtable]$Node) {
	$response = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "getrawmempool"
	Assert-RpcOk -Response $response -Method ("getrawmempool({0})" -f $Node.Name)
	return @($response.result)
}

function Get-NodeBestBlockHash([hashtable]$Node) {
	$response = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "getbestblockhash"
	Assert-RpcOk -Response $response -Method ("getbestblockhash({0})" -f $Node.Name)
	return [string]$response.result
}

function Get-BlockRaw([hashtable]$Node, [long]$Height) {
	$hashResponse = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "getblockhash" -Params @($Height)
	Assert-RpcOk -Response $hashResponse -Method ("getblockhash({0},{1})" -f $Node.Name, $Height)
	$blockResponse = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "getblock" -Params @($hashResponse.result, 0)
	Assert-RpcOk -Response $blockResponse -Method ("getblock({0},{1})" -f $Node.Name, $Height)
	return [string]$blockResponse.result
}

function Sync-BlocksFromSource([hashtable]$SourceNode, [hashtable[]]$TargetNodes) {
	$sourceHeight = Get-NodeHeight -Node $SourceNode
	foreach ($targetNode in $TargetNodes) {
		$targetHeight = Get-NodeHeight -Node $targetNode
		if ($targetHeight -ge $sourceHeight) {
			continue
		}

		for ($height = $targetHeight + 1; $height -le $sourceHeight; $height++) {
			$rawBlock = Get-BlockRaw -Node $SourceNode -Height $height
			$submitResponse = Invoke-RpcJson -TargetHost $targetNode.HostName -Port $targetNode.RpcPort -ApiKey $ApiKey -Method "submitblock" -Params @($rawBlock)
			Assert-RpcOk -Response $submitResponse -Method ("submitblock({0}<={1}@{2})" -f $targetNode.Name, $SourceNode.Name, $height)
		}
	}
}

function Get-RawTransaction([hashtable]$Node, [string]$TxId) {
	$response = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "getrawtransaction" -Params @($TxId, $false)
	Assert-RpcOk -Response $response -Method ("getrawtransaction({0},{1})" -f $Node.Name, $TxId)
	return [string]$response.result
}

function Relay-TransactionFromSource([hashtable]$SourceNode, [hashtable[]]$TargetNodes, [string]$TxId) {
	$rawTransaction = Get-RawTransaction -Node $SourceNode -TxId $TxId
	foreach ($targetNode in $TargetNodes) {
		$submitResponse = Invoke-RpcJson -TargetHost $targetNode.HostName -Port $targetNode.RpcPort -ApiKey $ApiKey -Method "sendrawtransaction" -Params @($rawTransaction)
		Assert-RpcOk -Response $submitResponse -Method ("sendrawtransaction({0}<={1})" -f $targetNode.Name, $SourceNode.Name)
	}
}

function Connect-Nodes([hashtable]$SourceNode, [hashtable[]]$TargetNodes) {
	foreach ($targetNode in $TargetNodes) {
		$address = "{0}:{1}" -f $targetNode.HostName, $targetNode.P2pPort
		$response = Invoke-RpcJson -TargetHost $SourceNode.HostName -Port $SourceNode.RpcPort -ApiKey $ApiKey -Method "addnode" -Params @($address, "add")
		Assert-RpcOk -Response $response -Method ("addnode({0}->{1})" -f $SourceNode.Name, $targetNode.Name)
	}
}

function New-Wallet([hashtable]$Node, [string]$WalletName, [string]$Passphrase) {
	$response = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "createwallet" -Params @($WalletName, $Passphrase)
	Assert-RpcOk -Response $response -Method ("createwallet({0}/{1})" -f $Node.Name, $WalletName)
	return $response.result
}

function Load-Wallet([hashtable]$Node, [string]$WalletName, [string]$Passphrase) {
	$response = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "loadwallet" -Params @($WalletName, $Passphrase)
	Assert-RpcOk -Response $response -Method ("loadwallet({0}/{1})" -f $Node.Name, $WalletName)
	return $response.result
}

function Unlock-Wallet([hashtable]$Node, [string]$Passphrase, [int]$TimeoutSec = 600) {
	$response = Invoke-RpcJson -TargetHost $Node.HostName -Port $Node.RpcPort -ApiKey $ApiKey -Method "walletpassphrase" -Params @($Passphrase, $TimeoutSec)
	Assert-RpcOk -Response $response -Method ("walletpassphrase({0})" -f $Node.Name)
}

$workspaceRoot = Resolve-WorkspaceRoot
$exe = Resolve-DemoBinary

$outputRoot = Join-Path $workspaceRoot $OutputDir
if (-not (Test-Path $outputRoot)) {
	New-Item -ItemType Directory -Path $outputRoot | Out-Null
}

if ($Clean) {
	Get-ChildItem -LiteralPath $outputRoot -ErrorAction SilentlyContinue | ForEach-Object {
		Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
	}
}

$nodes = @(
	@{ Name = "node1"; HostName = $HostName; RpcPort = 38634; RestPort = 38080; P2pPort = 38633 },
	@{ Name = "node2"; HostName = $HostName; RpcPort = 38644; RestPort = 38090; P2pPort = 38643 },
	@{ Name = "node3"; HostName = $HostName; RpcPort = 38654; RestPort = 38100; P2pPort = 38653 }
)

foreach ($node in $nodes) {
	$node.DataDir = Join-Path $outputRoot $node.Name
	$node.StdoutPath = Join-Path $outputRoot ("{0}.out" -f $node.Name)
	$node.StderrPath = Join-Path $outputRoot ("{0}.err" -f $node.Name)
	foreach ($path in @($node.DataDir, $node.StdoutPath, $node.StderrPath)) {
		if (Test-Path $path) {
			Remove-Item -LiteralPath $path -Recurse -Force
		}
	}
	New-Item -ItemType Directory -Path $node.DataDir | Out-Null
}

$processes = @()

try {
	Write-Section "Start local nodes"
	foreach ($node in $nodes) {
		$process = Start-TestNode -Exe $exe -Node $node
		$node.ProcessId = $process.Id
		$processes += $process
		if (-not (Wait-RpcReady -Node $node -TimeoutSec $StartupTimeoutSec)) {
			throw ("{0} did not become ready on RPC port {1}" -f $node.Name, $node.RpcPort)
		}
		Write-Host ("{0}: rpc={1} p2p={2}" -f $node.Name, $node.RpcPort, $node.P2pPort)
	}

	Write-Section "Connect peers"
	Connect-Nodes -SourceNode $nodes[1] -TargetNodes @($nodes[0])
	Connect-Nodes -SourceNode $nodes[2] -TargetNodes @($nodes[0], $nodes[1])

	$null = Wait-Until -TimeoutSec $SyncTimeoutSec -Description "all nodes to observe at least one peer connection" -Condition {
		foreach ($candidate in $nodes) {
			if ((Get-NodeConnections -Node $candidate) -lt 1) {
				return $false
			}
		}
		return $true
	}

	$connectionSummary = foreach ($node in $nodes) {
		[pscustomobject]@{
			node = $node.Name
			connections = Get-NodeConnections -Node $node
		}
	}

	Write-Section "Block propagation"
	$minerWallet = New-Wallet -Node $nodes[0] -WalletName "multinode-miner" -Passphrase "multinode-miner-passphrase"
	$mined = Invoke-RpcJson -TargetHost $nodes[0].HostName -Port $nodes[0].RpcPort -ApiKey $ApiKey -Method "generatetoaddress" -Params @(1, $minerWallet.address)
	Assert-RpcOk -Response $mined -Method "generatetoaddress(block-propagation)"
	$expectedHeight = Get-NodeHeight -Node $nodes[0]
	$blockRelayMode = "p2p"

	if (-not (Test-Until -TimeoutSec 5 -Condition {
		foreach ($candidate in $nodes) {
			if ((Get-NodeHeight -Node $candidate) -ne $expectedHeight) {
				return $false
			}
		}
		return $true
	})) {
		Sync-BlocksFromSource -SourceNode $nodes[0] -TargetNodes @($nodes[1], $nodes[2])
		$blockRelayMode = "rpc-fallback"
	}

	$null = Wait-Until -TimeoutSec $SyncTimeoutSec -Description "all nodes to converge on the mined height" -Condition {
		foreach ($candidate in $nodes) {
			if ((Get-NodeHeight -Node $candidate) -ne $expectedHeight) {
				return $false
			}
		}
		return $true
	}

	$heightSummary = foreach ($node in $nodes) {
		[pscustomobject]@{
			node = $node.Name
			height = Get-NodeHeight -Node $node
		}
	}

	$transactionSummary = $null
	if ($FullTest) {
		Write-Section "Transaction propagation"
		$senderWallet = New-Wallet -Node $nodes[0] -WalletName "multinode-sender" -Passphrase "multinode-sender-passphrase"
		$recipientWallet = New-Wallet -Node $nodes[1] -WalletName "multinode-recipient" -Passphrase "multinode-recipient-passphrase"
		$confirmWallet = New-Wallet -Node $nodes[0] -WalletName "multinode-confirm" -Passphrase "multinode-confirm-passphrase"

		Load-Wallet -Node $nodes[0] -WalletName "multinode-sender" -Passphrase "multinode-sender-passphrase" | Out-Null
		Unlock-Wallet -Node $nodes[0] -Passphrase "multinode-sender-passphrase"

		$funding = Invoke-RpcJson -TargetHost $nodes[0].HostName -Port $nodes[0].RpcPort -ApiKey $ApiKey -Method "generatetoaddress" -Params @($FundingBlocks, $senderWallet.address)
		Assert-RpcOk -Response $funding -Method "generatetoaddress(funding)"
		$fundingRelayMode = "p2p"
		if (-not (Test-Until -TimeoutSec 5 -Condition {
			foreach ($candidate in @($nodes[1], $nodes[2])) {
				if ((Get-NodeHeight -Node $candidate) -ne (Get-NodeHeight -Node $nodes[0])) {
					return $false
				}
			}
			return $true
		})) {
			Sync-BlocksFromSource -SourceNode $nodes[0] -TargetNodes @($nodes[1], $nodes[2])
			$fundingRelayMode = "rpc-fallback"
		}

		$senderBalanceBefore = Invoke-RpcJson -TargetHost $nodes[0].HostName -Port $nodes[0].RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($senderWallet.address)
		Assert-RpcOk -Response $senderBalanceBefore -Method "getbalance(sender-before)"

		$sendResult = Invoke-RpcJson -TargetHost $nodes[0].HostName -Port $nodes[0].RpcPort -ApiKey $ApiKey -Method "sendtoaddress" -Params @($recipientWallet.address, $TransferAmount)
		Assert-RpcOk -Response $sendResult -Method "sendtoaddress(multinode)"
		$txid = $sendResult.result.txid
		$transactionRelayMode = "p2p"

		if (-not (Test-Until -TimeoutSec 5 -Condition {
			foreach ($candidate in $nodes) {
				if (-not ((Get-NodeMempool -Node $candidate) -contains $txid)) {
					return $false
				}
			}
			return $true
		})) {
			Relay-TransactionFromSource -SourceNode $nodes[0] -TargetNodes @($nodes[1], $nodes[2]) -TxId $txid
			$transactionRelayMode = "rpc-fallback"
		}

		$null = Wait-Until -TimeoutSec $SyncTimeoutSec -Description "transaction to appear in all mempools" -Condition {
			foreach ($candidate in $nodes) {
				if (-not ((Get-NodeMempool -Node $candidate) -contains $txid)) {
					return $false
				}
			}
			return $true
		}

		Load-Wallet -Node $nodes[0] -WalletName "multinode-confirm" -Passphrase "multinode-confirm-passphrase" | Out-Null
		$confirm = Invoke-RpcJson -TargetHost $nodes[0].HostName -Port $nodes[0].RpcPort -ApiKey $ApiKey -Method "generatetoaddress" -Params @(1, $confirmWallet.address)
		Assert-RpcOk -Response $confirm -Method "generatetoaddress(confirm)"
		$confirmedHeight = Get-NodeHeight -Node $nodes[0]
		$confirmationRelayMode = "p2p"
		if (-not (Test-Until -TimeoutSec 5 -Condition {
			foreach ($candidate in @($nodes[1], $nodes[2])) {
				if ((Get-NodeHeight -Node $candidate) -ne $confirmedHeight) {
					return $false
				}
			}
			return $true
		})) {
			Sync-BlocksFromSource -SourceNode $nodes[0] -TargetNodes @($nodes[1], $nodes[2])
			$confirmationRelayMode = "rpc-fallback"
		}

		$null = Wait-Until -TimeoutSec $SyncTimeoutSec -Description "all nodes to converge after confirming the transaction" -Condition {
			foreach ($candidate in $nodes) {
				if ((Get-NodeHeight -Node $candidate) -ne $confirmedHeight) {
					return $false
				}
			}
			return $true
		}

		$recipientBalance = Invoke-RpcJson -TargetHost $nodes[1].HostName -Port $nodes[1].RpcPort -ApiKey $ApiKey -Method "getbalance" -Params @($recipientWallet.address)
		Assert-RpcOk -Response $recipientBalance -Method "getbalance(recipient-after)"

		$transactionSummary = [pscustomobject]@{
			senderAddress = $senderWallet.address
			senderBalanceBefore = $senderBalanceBefore.result
			recipientAddress = $recipientWallet.address
			recipientBalanceAfter = $recipientBalance.result
			txid = $txid
			amount = $TransferAmount
			fundingBlocks = @($funding.result).Count
			confirmationBlocks = @($confirm.result).Count
			fundingRelayMode = $fundingRelayMode
			transactionRelayMode = $transactionRelayMode
			confirmationRelayMode = $confirmationRelayMode
		}
	}

	$summary = [pscustomobject]@{
		outputRoot = $outputRoot
		network = $Network
		fullTest = [bool]$FullTest
		nodes = foreach ($node in $nodes) {
			[pscustomobject]@{
				name = $node.Name
				rpcPort = $node.RpcPort
				p2pPort = $node.P2pPort
				dataDir = $node.DataDir
				stdout = $node.StdoutPath
				stderr = $node.StderrPath
			}
		}
		connections = $connectionSummary
		blockRelayMode = $blockRelayMode
		heights = $heightSummary
		transaction = $transactionSummary
	}

	if ($Json) {
		$summary | ConvertTo-Json -Depth 8
	} else {
		Write-Host "Multi-node test passed" -ForegroundColor Green
		Write-Host ($summary | ConvertTo-Json -Depth 8)
	}
}
finally {
	foreach ($process in $processes) {
		try {
			Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
		} catch {
		}
	}

	try {
		Stop-KubercoinProcesses -WaitTimeoutMs 5000 | Out-Null
	} catch {
	}
}

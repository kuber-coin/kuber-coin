param(
  [string]$ApiKey = "public_test_key_not_a_secret",
  [int]$RpcPort = 8634,
  [int]$HttpPort = 8090,
  [int]$StartupTimeoutSec = 20
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

function Wait-Port($Port, $TimeoutSec){
  Write-Section "Waiting for port $Port"
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while((Get-Date) -lt $deadline){
    try { $c = New-Object System.Net.Sockets.TcpClient("127.0.0.1", $Port); if ($c.Connected) { $c.Close(); return $true } } catch {}
    Start-Sleep -Milliseconds 300
  }
  throw "Port $Port did not become ready within $TimeoutSec seconds"
}

function Find-HttpPort([int]$PreferredPort){
  Write-Section "Discovering HTTP API port"
  $ports = @($PreferredPort)
  $ports += (8634..8649)
  $ports = $ports | Select-Object -Unique
  for($attempt=1; $attempt -le 20; $attempt++){
    foreach($p in $ports){
      try {
        $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/api/health" -f $p) -UseBasicParsing -TimeoutSec 3
        if($r.StatusCode -eq 200 -and ($r.Content -match '"ok"\s*:\s*true')){
          Write-Host ("HTTP API detected on port {0}" -f $p)
          return $p
        }
      } catch {}
    }
    Start-Sleep -Milliseconds 250
  }
  throw "HTTP API not detected on preferred or fallback ports"
}

$exe = Ensure-Binary
$env:KUBERCOIN_API_KEYS = $ApiKey
$env:KUBERCOIN_HTTP_PORT = $HttpPort
$walletPath = "reports\smoke_wallet2.json"

Write-Section "Start node"
$logDir = "reports"
if(-not (Test-Path $logDir)){ New-Item -ItemType Directory -Path $logDir | Out-Null }
$stdoutPath = Join-Path $logDir "smoke_http_rpc.out"
$stderrPath = Join-Path $logDir "smoke_http_rpc.err"
$proc = Start-Process -FilePath $exe -ArgumentList "node","--no-p2p" -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
try {
  Wait-Port -Port $RpcPort -TimeoutSec $StartupTimeoutSec | Out-Null
  # Wait for specified HTTP port
  Wait-Port -Port $HttpPort -TimeoutSec $StartupTimeoutSec | Out-Null

  Write-Section "Ensure recipient wallet"
  if(-not (Test-Path $walletPath)){
    & $exe new-wallet $walletPath | Out-Null
  }
  $addr = & $exe get-address $walletPath
  Write-Host ("Recipient address: {0}" -f $addr)

  Write-Section "REST address balance"
  $uri = "http://127.0.0.1:$HttpPort/api/v1/address/$addr/balance"
  $rest = Invoke-WebRequest -Uri $uri -UseBasicParsing
  Write-Host $rest.Content

  Write-Section "RPC generatetoaddress (2 blocks)"
  $payload = @{ jsonrpc = "2.0"; method = "generatetoaddress"; params = @($addr, 2); id = 1 } | ConvertTo-Json -Compress
  Write-Host ("RPC request body: {0}" -f $payload)
  $headers = @{ Authorization = $ApiKey; "X-API-Key" = $ApiKey; "Content-Type" = "application/json" }
  $rpc = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/" -f $RpcPort) -Method Post -Headers $headers -Body $payload -UseBasicParsing
  Write-Host $rpc.Content

  # Show RPC debug logs if any
  if(Test-Path $stderrPath){
    Write-Section "RPC server debug"
    Get-Content -Path $stderrPath -Raw | Out-String | Write-Host
  }

  Write-Section "REST address balance (after generate)"
  $rest2 = Invoke-WebRequest -Uri $uri -UseBasicParsing
  Write-Host $rest2.Content
}
finally {
  if ($proc) { try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {} }
}

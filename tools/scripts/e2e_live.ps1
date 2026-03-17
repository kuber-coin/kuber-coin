param(
  [string]$HostName = "127.0.0.1",
  [int]$HttpPort = 8634,
  [int]$RpcPort = 8634,
  [int]$WsPort = 8634,
  [int]$MetricsPort = 8634,
  [int]$PrometheusPort = 9092,
  [int]$GrafanaPort = 3000,
  [string]$GrafanaUser = "admin",
  [string]$GrafanaPassword = "admin",
  [switch]$StrictMonitoring,
  [int]$ExplorerPort = 3200,
  [int]$WalletPort = 3250,
  [int]$OpsPort = 3300,
  [string]$ApiKey = "",
  [int]$TimeoutSec = 10
)

$ErrorActionPreference = "Stop"

# If not provided explicitly, try common env vars used across the repo/compose/UIs.
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = $env:KUBERCOIN_API_KEY
  if ([string]::IsNullOrWhiteSpace($ApiKey)) { $ApiKey = $env:KUBERCOIN_RPC_API_KEY }
  if ([string]::IsNullOrWhiteSpace($ApiKey)) { $ApiKey = $env:KUBERCOIN_API_KEYS }
  if ([string]::IsNullOrWhiteSpace($ApiKey)) { $ApiKey = $env:KUBERCOIN_WALLET_API_KEY }

  # If multiple keys are provided (comma/semicolon/space separated), pick the first.
  if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
    $first = ($ApiKey -split '[,;\s]+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
    if ($first) { $ApiKey = $first }
  }
}

$AuthHeaders = @{}
if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $authValue = $ApiKey.Trim()
  if ($authValue -notmatch '^(Bearer|ApiKey)\s') {
    $authValue = "Bearer $authValue"
  }
  $AuthHeaders["Authorization"] = $authValue
}

function Write-Section([string]$title) {
  Write-Host "`n=== $title ===" -ForegroundColor Cyan
}

function Fail([string]$msg) {
  Write-Host "FAIL: $msg" -ForegroundColor Red
  exit 1
}

function Ok([string]$msg) {
  Write-Host "OK: $msg" -ForegroundColor Green
}

function Warn([string]$msg) {
  Write-Host "WARN: $msg" -ForegroundColor Yellow
}

function Wait-Until(
  [scriptblock]$Condition,
  [int]$TimeoutSeconds,
  [int]$PollMilliseconds = 500
) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      if (& $Condition) { return $true }
    } catch {
      # ignore transient failures during polling
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }
  return $false
}

function Try-Restart-DockerNodeIfAvailable() {
  try {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
    Push-Location $repoRoot
    try {
      $psText = (docker compose ps 2>$null | Out-String)
      if ([string]::IsNullOrWhiteSpace($psText)) { return $false }
      if ($psText -notmatch "\bkubercoin-node\b") { return $false }
      Warn "Attempting docker compose restart node to clear RPC ban..."
      docker compose restart node | Out-Null
      return $true
    } finally {
      Pop-Location
    }
  } catch {
    return $false
  }
}

function Invoke-HttpRawJson(
  [ValidateSet('GET','POST')] [string]$Method,
  [string]$Path,
  [string]$JsonBody = "",
  [hashtable]$ExtraHeaders = @{}
) {
  $target = "$HostName`:$HttpPort"

  $headers = @{
    "Host" = $target
    "Connection" = "close"
    "Accept" = "application/json"
  }
  foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] }

  if ($ApiKey -and -not $headers.ContainsKey("Authorization")) {
    $authValue = $ApiKey
    if ($authValue -notmatch '^(Bearer|ApiKey)\s') {
      $authValue = "Bearer $authValue"
    }
    $headers["Authorization"] = $authValue
  }

  $bodyBytes = @()
  if ($Method -eq "POST") {
    $headers["Content-Type"] = "application/json"
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
    $headers["Content-Length"] = $bodyBytes.Length
  }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("$Method $Path HTTP/1.1`r`n")
  foreach ($h in $headers.GetEnumerator()) {
    [void]$sb.Append("$($h.Key): $($h.Value)`r`n")
  }
  [void]$sb.Append("`r`n")

  $client = New-Object System.Net.Sockets.TcpClient
  $client.ReceiveTimeout = $TimeoutSec * 1000
  $client.SendTimeout = $TimeoutSec * 1000

  $client.Connect($HostName, $HttpPort)
  $stream = $client.GetStream()

  $headBytes = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
  if ($Method -eq "POST" -and $bodyBytes.Length -gt 0) {
    $reqBytes = New-Object byte[] ($headBytes.Length + $bodyBytes.Length)
    [Array]::Copy($headBytes, 0, $reqBytes, 0, $headBytes.Length)
    [Array]::Copy($bodyBytes, 0, $reqBytes, $headBytes.Length, $bodyBytes.Length)
    $stream.Write($reqBytes, 0, $reqBytes.Length)
  } else {
    $stream.Write($headBytes, 0, $headBytes.Length)
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while (-not $stream.DataAvailable -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 50
  }

  $buffer = New-Object byte[] 65536
  $respSb = New-Object System.Text.StringBuilder
  while ($stream.DataAvailable) {
    $n = $stream.Read($buffer, 0, $buffer.Length)
    if ($n -le 0) { break }
    [void]$respSb.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $n))
    Start-Sleep -Milliseconds 10
  }

  $client.Close()

  $respText = $respSb.ToString()
  $statusLine = ($respText -split "`n")[0].Trim()
  $statusCode = 0
  if ($statusLine -match "HTTP/\d\.\d\s+(\d+)") {
    $statusCode = [int]$Matches[1]
  }

  $body = ""
  if ($respText -match "\r\n\r\n") {
    $body = ($respText -split "\r\n\r\n", 2)[1]
  } elseif ($respText -match "\n\n") {
    $body = ($respText -split "\n\n", 2)[1]
  }

  $json = $null
  try {
    if ($body) { $json = $body | ConvertFrom-Json }
  } catch {
    $json = $null
  }

  return [pscustomobject]@{
    StatusCode = $statusCode
    Raw = $respText
    Body = $body
    Json = $json
  }
}

function Invoke-RpcRaw(
  [string]$Method,
  [object[]]$Params = @()
) {
  $payload = @{ jsonrpc = "2.0"; method = $Method; params = $Params; id = 1 } | ConvertTo-Json -Compress
  $target = "$HostName`:$RpcPort"

  $headers = @{
    "Host" = $target
    "Content-Type" = "application/json"
    "Content-Length" = $payload.Length
    "Connection" = "close"
  }
  if ($ApiKey) {
    $authValue = $ApiKey
    if ($authValue -notmatch '^(Bearer|ApiKey)\s') {
      $authValue = "Bearer $authValue"
    }
    $headers["Authorization"] = $authValue
  }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("POST / HTTP/1.1`r`n")
  foreach ($h in $headers.GetEnumerator()) {
    [void]$sb.Append("$($h.Key): $($h.Value)`r`n")
  }
  [void]$sb.Append("`r`n")
  [void]$sb.Append($payload)

  $client = New-Object System.Net.Sockets.TcpClient
  $client.ReceiveTimeout = $TimeoutSec * 1000
  $client.SendTimeout = $TimeoutSec * 1000
  $client.Connect($HostName, $RpcPort)

  $stream = $client.GetStream()
  $bytes = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
  $stream.Write($bytes, 0, $bytes.Length)
  Start-Sleep -Milliseconds 250

  $buffer = New-Object byte[] 65536
  $respSb = New-Object System.Text.StringBuilder
  while ($stream.DataAvailable) {
    $n = $stream.Read($buffer, 0, $buffer.Length)
    if ($n -le 0) { break }
    [void]$respSb.Append([System.Text.Encoding]::ASCII.GetString($buffer, 0, $n))
  }
  $client.Close()

  $respText = $respSb.ToString()
  $match = Select-String -InputObject $respText -Pattern "\{.*\}" -AllMatches
  if ($match -and $match.Matches.Count -gt 0) {
    return ($match.Matches[0].Value | ConvertFrom-Json)
  }
  throw "No JSON body returned from RPC"
}

Write-Section "Docker compose status"
try {
  $ps = docker compose ps 2>$null
  Write-Host $ps
} catch {
  Write-Host "(docker compose ps failed; continuing)" -ForegroundColor Yellow
}

Write-Section "HTTP health"
try {
  $health = Invoke-WebRequest -Uri "http://localhost:$HttpPort/api/health" -UseBasicParsing -TimeoutSec $TimeoutSec -Headers $AuthHeaders
  if ($health.StatusCode -ne 200) { Fail "HTTP /api/health status $($health.StatusCode)" }
  Ok "HTTP /api/health 200"
} catch {
  Fail "HTTP /api/health not reachable: $($_.Exception.Message)"
}

Write-Section "Wallet discovery (GET)"
try {
  $wallets = Invoke-RestMethod -Method Get -Uri "http://localhost:$WalletPort/api/wallets" -TimeoutSec $TimeoutSec -Headers $AuthHeaders
  if (-not $wallets.wallets -or $wallets.wallets.Count -lt 1) {
    Fail "GET /api/wallets returned no wallets"
  }
  Ok ("Wallets listed ({0})" -f $wallets.wallets.Count)
} catch {
  Fail "GET /api/wallets failed: $($_.Exception.Message)"
}

Write-Section "Wallet balance (GET)"
$walletName = "test-wallet.json"
if ($wallets.wallets -notcontains $walletName) {
  $walletName = $wallets.wallets[0]
}
try {
  $bal = Invoke-RestMethod -Method Get -Uri ("http://localhost:$WalletPort/api/wallet/balance?name={0}" -f [Uri]::EscapeDataString($walletName)) -TimeoutSec $TimeoutSec -Headers $AuthHeaders
  if (-not $bal.address) {
    Fail "Wallet balance response missing address"
  }
  $address = $bal.address
  Write-Host "Wallet: $walletName" -ForegroundColor Gray
  Write-Host "Address: $address" -ForegroundColor Gray
  Ok ("Wallet balance ok (total={0} spendable={1} height={2})" -f $bal.total, $bal.spendable, $bal.height)
} catch {
  Fail "GET /api/wallet/balance failed: $($_.Exception.Message)"
}

Write-Section "Address endpoints (optional)"
try {
  $addrUrl = ("http://localhost:$HttpPort/api/v1/address/{0}/balance" -f $address)
  $addrBal = Invoke-RestMethod -Method Get -Uri $addrUrl -TimeoutSec $TimeoutSec -Headers $AuthHeaders
  Ok ("Address endpoint available (total={0} spendable={1} height={2})" -f $addrBal.total, $addrBal.spendable, $addrBal.height)
} catch {
  $code = $null
  try { $code = $_.Exception.Response.StatusCode.value__ } catch {}
  Write-Host ("WARN: address endpoint not available ({0}). Skipping." -f ($(if($code){$code}else{$_.Exception.Message}))) -ForegroundColor Yellow
}

Write-Section "RPC smoke (raw)"
try {
  $maxAttempts = 3
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      $r = Invoke-RpcRaw -Method "getblockcount"
      if ($r.error) {
        $errMsg = "$($r.error.code) $($r.error.message)"
        if ($r.error.message -match "Missing API key" -or $r.error.message -match "Unauthorized") {
          if ([string]::IsNullOrWhiteSpace($ApiKey)) {
            Fail "RPC Unauthorized: no API key configured. Provide -ApiKey or set env KUBERCOIN_API_KEYS/KUBERCOIN_API_KEY (Bearer/ApiKey supported)."
          } else {
            Fail "RPC Unauthorized: API key rejected. Check -ApiKey / env KUBERCOIN_API_KEYS value and ensure the docker node is using the same key."
          }
        }
        if ($r.error.message -match "IP banned") {
          if ($attempt -eq 1) {
            $restarted = Try-Restart-DockerNodeIfAvailable
            if ($restarted) {
              $ok = Wait-Until -TimeoutSeconds 60 -Condition {
                try {
                  $health = Invoke-WebRequest -Uri "http://localhost:$HttpPort/api/health" -UseBasicParsing -TimeoutSec $TimeoutSec -Headers $AuthHeaders
                  return ($health.StatusCode -eq 200)
                } catch { return $false }
              }
              if (-not $ok) { Warn "Node restart attempted but health did not stabilize quickly" }
            }
          }

          if ($attempt -lt $maxAttempts) {
            Warn "RPC temporarily IP-banned; waiting and retrying ($attempt/$maxAttempts)"
            Start-Sleep -Seconds 2
            continue
          }
        }

        Fail "RPC error: $errMsg"
      }
      $blockCount = [int]$r.result
      Ok ("RPC getblockcount ok ($blockCount)")
      break
    } catch {
      $msg = $_.Exception.Message
      if (($msg -match "IP banned") -and ($attempt -lt $maxAttempts)) {
        Warn "RPC temporarily IP-banned; waiting and retrying ($attempt/$maxAttempts)"
        Start-Sleep -Seconds 2
        continue
      }
      throw
    }
  }
} catch {
  if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Fail "RPC getblockcount failed (no API key configured). Set -ApiKey or env KUBERCOIN_API_KEYS/KUBERCOIN_API_KEY. Error: $($_.Exception.Message)"
  }
  Fail "RPC getblockcount failed: $($_.Exception.Message)"
}

Write-Section "WebSocket connect"
$wsEndpointAvailable = $true
try {
  Invoke-WebRequest -Uri ("http://localhost:{0}/ws" -f $WsPort) -UseBasicParsing -TimeoutSec $TimeoutSec | Out-Null
} catch {
  $statusCode = $null
  try { $statusCode = $_.Exception.Response.StatusCode.value__ } catch {}
  if ($statusCode -eq 404) {
    $wsEndpointAvailable = $false
    Warn "WebSocket endpoint /ws is not exposed by the current node runtime; skipping."
  }
}

if ($wsEndpointAvailable) {
  try {
    Add-Type -AssemblyName System.Net.Http | Out-Null
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource($TimeoutSec * 1000)
    $ws.ConnectAsync([Uri]("ws://localhost:{0}/ws" -f $WsPort), $cts.Token).GetAwaiter().GetResult() | Out-Null
    if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
      Fail "WebSocket state is $($ws.State)"
    }
    $ws.Dispose()
    Ok "WebSocket connected"
  } catch {
    Fail "WebSocket connect failed: $($_.Exception.Message)"
  }
}

Write-Section "Monitoring"

Write-Host ("Metrics:     http://{0}:{1}/metrics" -f $HostName, $MetricsPort) -ForegroundColor Gray
Write-Host ("Prometheus:  http://{0}:{1}/" -f $HostName, $PrometheusPort) -ForegroundColor Gray
Write-Host ("Grafana:     http://{0}:{1}/" -f $HostName, $GrafanaPort) -ForegroundColor Gray

try {
  $m = Invoke-WebRequest -Uri ("http://{0}:{1}/metrics" -f $HostName, $MetricsPort) -UseBasicParsing -TimeoutSec $TimeoutSec
  if ($m.StatusCode -ne 200) { Fail "Metrics endpoint status $($m.StatusCode)" }
  if (-not $m.Content -or $m.Content -notmatch "#\s*HELP") {
    Fail "Metrics endpoint returned unexpected content"
  }
  Ok "Node /metrics reachable"
} catch {
  Fail "Node /metrics not reachable: $($_.Exception.Message)"
}

try {
  $build = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/status/buildinfo" -f $HostName, $PrometheusPort) -TimeoutSec $TimeoutSec
  if ($build.status -ne "success") {
    if ($StrictMonitoring) { Fail "Prometheus buildinfo status '$($build.status)'" }
    else { Warn "Prometheus buildinfo status '$($build.status)' (skipped - use -StrictMonitoring to require)" }
  } else {
    Ok "Prometheus API reachable"
  }
} catch {
  if ($StrictMonitoring) { Fail "Prometheus API not reachable: $($_.Exception.Message)" }
  else { Warn "Prometheus not running (skipped - use -StrictMonitoring to require)" }
}

# Prometheus checks - only run when StrictMonitoring or Prometheus is available
$prometheusAvailable = $false
try {
  $build = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/status/buildinfo" -f $HostName, $PrometheusPort) -TimeoutSec 3
  if ($build.status -eq "success") { $prometheusAvailable = $true }
} catch { }

if ($prometheusAvailable -or $StrictMonitoring) {
  try {
    $script:promHeight = $null
    $ok = Wait-Until -TimeoutSeconds $TimeoutSec -PollMilliseconds 500 -Condition {
      $q = [Uri]::EscapeDataString("kubercoin_block_height")
      $script:promHeight = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/query?query={2}" -f $HostName, $PrometheusPort, $q) -TimeoutSec $TimeoutSec
      if ($script:promHeight.status -ne "success") { return $false }
      $results = @($script:promHeight.data.result)
      return ($results.Count -ge 1)
    }
    if (-not $ok -or $null -eq $script:promHeight) {
      try {
        Write-Host "Prometheus diagnostics (no kubercoin_block_height samples yet):" -ForegroundColor Yellow

        try {
          $targets = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/targets" -f $HostName, $PrometheusPort) -TimeoutSec $TimeoutSec
          if ($targets.status -eq "success") {
            $active = @($targets.data.activeTargets)
            $nodeTargets = @($active | Where-Object { $_.labels.job -eq "kubercoin-node" })
            if ($nodeTargets.Count -gt 0) {
              $nodeTargets | Select-Object -Property @{n='job';e={$_.labels.job}}, @{n='health';e={$_.health}}, @{n='scrapeUrl';e={$_.scrapeUrl}}, @{n='lastScrape';e={$_.lastScrape}}, @{n='lastError';e={$_.lastError}} | Format-Table -AutoSize | Out-String | Write-Host
            } else {
              Write-Host "No activeTargets found for job kubercoin-node" -ForegroundColor Yellow
            }
          } else {
            Write-Host ("Prometheus /targets status: {0}" -f $targets.status) -ForegroundColor Yellow
          }
        } catch {
          Write-Host ("Prometheus /targets query failed: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
        }

        try {
          $upQ = [Uri]::EscapeDataString('up{job="kubercoin-node"}')
          $up = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/query?query={2}" -f $HostName, $PrometheusPort, $upQ) -TimeoutSec $TimeoutSec
          $upCount = 0
          try { $upCount = @($up.data.result).Count } catch { $upCount = 0 }
          Write-Host ('Prometheus series up{job="kubercoin-node"}: {0}' -f $upCount) -ForegroundColor Gray
        } catch {
          Write-Host ('Prometheus up{job="kubercoin-node"} query failed: {0}' -f $_.Exception.Message) -ForegroundColor Yellow
        }
      } catch {
        # best-effort diagnostics only
      }
      Fail "Prometheus has no samples for kubercoin_block_height"
    }
    if ($script:promHeight.status -ne "success") { Fail "Prometheus query status '$($script:promHeight.status)'" }
    $results = @($script:promHeight.data.result)
    if ($results.Count -lt 1) { Fail "Prometheus has no samples for kubercoin_block_height" }

    $sample = $results[0]
    $promValue = $null
    try { $promValue = [int]$sample.value[1] } catch { $promValue = $null }
    if ($null -eq $promValue) { Fail "Prometheus kubercoin_block_height sample not parseable" }
    $diff = [Math]::Abs($promValue - $blockCount)
    if ($diff -gt 2) {
      Fail ("Height mismatch: Prometheus={0} RPC={1} (diff={2})" -f $promValue, $blockCount, $diff)
    }
    Ok ("Prometheus query kubercoin_block_height ok (value={0}, diff={1})" -f $promValue, $diff)
  } catch {
    Fail "Prometheus query failed: $($_.Exception.Message)"
  }

  try {
    $ok = Wait-Until -TimeoutSeconds $TimeoutSec -Condition {
      $targets = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/targets" -f $HostName, $PrometheusPort) -TimeoutSec $TimeoutSec
      if ($targets.status -ne "success") { return $false }
      $active = @($targets.data.activeTargets)
      $nodeTargets = @($active | Where-Object { $_.labels.job -eq "kubercoin-node" })
      if ($nodeTargets.Count -lt 1) { return $false }
      $down = @($nodeTargets | Where-Object { $_.health -ne "up" })
      return ($down.Count -eq 0)
    }
    if (-not $ok) {
      $targets = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/targets" -f $HostName, $PrometheusPort) -TimeoutSec $TimeoutSec
      $active = @($targets.data.activeTargets)
      $nodeTargets = @($active | Where-Object { $_.labels.job -eq "kubercoin-node" })
      if ($nodeTargets.Count -lt 1) { Fail "Prometheus has no activeTargets for job kubercoin-node" }
      $sample = $nodeTargets[0]
      Fail ("Prometheus target kubercoin-node not healthy (health={0}, lastError={1})" -f $sample.health, $sample.lastError)
    }
    Ok "Prometheus target kubercoin-node up"
  } catch {
    Fail "Prometheus target inspection failed: $($_.Exception.Message)"
  }
} else {
  Warn "Prometheus checks skipped (not running - use -StrictMonitoring to require)"
}

if ($prometheusAvailable -or $StrictMonitoring) {
  try {
    $expectedAlertRules = @(
      "KubercoinNodeDown",
      "KubercoinMetricsMissing",
      "KubercoinNoNewBlocks",
      "KubercoinHighBlockTime",
      "KubercoinPeerCountLow",
      "KubercoinNoPeers",
      "KubercoinMempoolBacklog",
      "KubercoinStorageLarge",
      "KubercoinTipDivergence",
      "KubercoinAPISaturation"
    )
    $ok = Wait-Until -TimeoutSeconds $TimeoutSec -Condition {
      $rules = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/rules" -f $HostName, $PrometheusPort) -TimeoutSec $TimeoutSec
      if ($rules.status -ne "success") { return $false }
      $groups = @($rules.data.groups)
      $kuberGroups = @($groups | Where-Object { $_.name -eq "kubercoin.alerts" })
      if ($kuberGroups.Count -lt 1) { return $false }
      $ruleNames = @($kuberGroups[0].rules | ForEach-Object { $_.name })
      foreach ($expectedRule in $expectedAlertRules) {
        if ($ruleNames -notcontains $expectedRule) { return $false }
      }
      return ($ruleNames.Count -eq $expectedAlertRules.Count)
    }
    if (-not $ok) {
      $rules = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/v1/rules" -f $HostName, $PrometheusPort) -TimeoutSec $TimeoutSec
      $groups = @($rules.data.groups)
      $kuberGroups = @($groups | Where-Object { $_.name -eq "kubercoin.alerts" })
      if ($kuberGroups.Count -lt 1) {
        Fail "Prometheus alert rules not loaded (kubercoin.alerts group missing)"
      }
      $ruleNames = @($kuberGroups[0].rules | ForEach-Object { $_.name })
      $missingRules = @($expectedAlertRules | Where-Object { $ruleNames -notcontains $_ })
      if ($missingRules.Count -gt 0) {
        Fail ("Prometheus alert rules incomplete; missing: {0}" -f ($missingRules -join ", "))
      }
      Fail ("Prometheus alert rules unexpected count {0}; expected {1}" -f $ruleNames.Count, $expectedAlertRules.Count)
    }
    Ok "Prometheus alert rules loaded (10/10 expected rules)"
  } catch {
    Fail "Prometheus rules check failed: $($_.Exception.Message)"
  }
}

# Grafana checks - only require when StrictMonitoring
$grafanaAvailable = $false
try {
  $g = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/health" -f $HostName, $GrafanaPort) -TimeoutSec 3
  if ($g.database -eq "ok" -or -not $g.database) { $grafanaAvailable = $true }
} catch { }

if ($grafanaAvailable) {
  Ok "Grafana health ok"
} elseif ($StrictMonitoring) {
  Fail "Grafana not reachable"
} else {
  Warn "Grafana not running (skipped - use -StrictMonitoring to require)"
}

# Optional: validate provisioning via Grafana API (requires auth)
if ($grafanaAvailable) {
  try {
    $pair = "{0}:{1}" -f $GrafanaUser, $GrafanaPassword
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes($pair))
    $gh = @{ Authorization = "Basic $b64" }

    $ds = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/datasources/name/Prometheus" -f $HostName, $GrafanaPort) -Headers $gh -TimeoutSec $TimeoutSec
    if (-not $ds -or $ds.type -ne "prometheus") { throw "Prometheus datasource missing or wrong type" }

    $search = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/search?type=dash-db&query={2}" -f $HostName, $GrafanaPort, [Uri]::EscapeDataString("Kubercoin")) -Headers $gh -TimeoutSec $TimeoutSec
    $hits = @($search | Where-Object { $_.uid -eq "kubercoin-overview" -or $_.title -eq "Kubercoin - Overview" })
    if ($hits.Count -lt 1) { throw "Dashboard 'Kubercoin - Overview' (uid kubercoin-overview) not found" }

    Ok "Grafana provisioning ok (datasource + dashboard)"
  } catch {
    if ($StrictMonitoring) {
      Fail "Grafana provisioning check failed: $($_.Exception.Message)"
    } else {
      Warn "Grafana provisioning check skipped/failed: $($_.Exception.Message)"
    }
  }
}

Write-Section "UI pages"
$ui = @(
  @{Name="Explorer"; Url=("http://localhost:{0}/" -f $ExplorerPort)},
  @{Name="Wallet"; Url=("http://localhost:{0}/" -f $WalletPort)},
  @{Name="Ops"; Url=("http://localhost:{0}/" -f $OpsPort)}
)
foreach($u in $ui) {
  try {
    $r = Invoke-WebRequest -Uri $u.Url -UseBasicParsing -TimeoutSec $TimeoutSec
    if ($r.StatusCode -ne 200) {
      if ($StrictMonitoring) { Fail ("{0} UI status {1}" -f $u.Name, $r.StatusCode) }
      else { Warn ("{0} UI status {1} (skipped - use -StrictMonitoring to require)" -f $u.Name, $r.StatusCode) }
    } else {
      Ok ("{0} UI 200" -f $u.Name)
    }
  } catch {
    if ($StrictMonitoring) { Fail ("{0} UI failed: {1}" -f $u.Name, $_.Exception.Message) }
    else { Warn ("{0} UI not running (skipped - use -StrictMonitoring to require)" -f $u.Name) }
  }
}

Write-Host "`nE2E LIVE SMOKE PASSED" -ForegroundColor Green
exit 0

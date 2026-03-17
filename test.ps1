Write-Host "=== KuberCoin Tests ===" -ForegroundColor Cyan
Write-Host ""

function Find-HttpApiPort {
    param(
        [string]$HostName = "127.0.0.1",
        [int]$TimeoutSec = 2
    )

    $portsToTry = @()
    if ($env:KUBERCOIN_HTTP_PORT) {
        $p = 0
        if ([int]::TryParse([string]$env:KUBERCOIN_HTTP_PORT, [ref]$p) -and $p -gt 0) {
            $portsToTry += $p
        }
    }
    # Prefer the dedicated test port first (matches VS Code task defaults)
    $portsToTry += 18080
    $portsToTry += (8080..8095)
    $portsToTry = $portsToTry | Select-Object -Unique

    foreach ($port in $portsToTry) {
        try {
            $resp = Invoke-WebRequest -Uri ("http://{0}:{1}/api/health" -f $HostName, $port) -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
            if ($resp.StatusCode -ne 200) { continue }
            $json = $null
            try { $json = $resp.Content | ConvertFrom-Json } catch { $json = $null }
            if ($null -ne $json -and $json.ok -eq $true) { return $port }
        } catch {
            continue
        }
    }
    return $null
}

Write-Host "Test 1: Health Check" -ForegroundColor Yellow
try {
    $p = Find-HttpApiPort -HostName "127.0.0.1" -TimeoutSec 2
    if ($null -eq $p) { throw "HTTP API health endpoint not found on ports 8080-8095" }
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/api/health" -f $p) -UseBasicParsing -TimeoutSec 2
    Write-Host "SUCCESS - Node running (:${p} $($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "FAILED - Node not running" -ForegroundColor Red
    exit 1
}
Write-Host ""
Write-Host "Test 2: Rate Limiting" -ForegroundColor Yellow
$ok = 0
$limited = 0
for ($i = 1; $i -le 70; $i++) {
    try {
        $null = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/api/health" -f $p) -UseBasicParsing -TimeoutSec 1
        $ok++
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 429) { $limited++ }
    }
    Start-Sleep -Milliseconds 50
}
Write-Host "  OK: $ok, Limited: $limited" -ForegroundColor Gray
if ($limited -gt 0) {
    Write-Host "SUCCESS - Rate limiting works" -ForegroundColor Green
} else {
    Write-Host "WARNING - No rate limiting" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Test 3: Authentication" -ForegroundColor Yellow
try {
    $null = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/api/wallet/send" -f $p) -Method POST -Body '{}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 2
    Write-Host "WARNING - No auth protection" -ForegroundColor Yellow
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Host "SUCCESS - Auth enforced (401)" -ForegroundColor Green
    } else {
        Write-Host "INFO - Status $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Gray
    }
}
Write-Host ""
Write-Host "All tests complete!" -ForegroundColor Cyan

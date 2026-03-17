param(
  [int]$TimeoutSeconds = 120,
  [int]$LogsTail = 200,
  [switch]$Build,
  [switch]$RemoveOrphans
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) {
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Write-Host "[$ts] $msg"
}

function Invoke-HttpOk {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [int]$TimeoutSec = 5,
    [hashtable]$Headers = $null
  )

  try {
    $params = @{ Uri = $Url; Method = 'GET'; TimeoutSec = $TimeoutSec }
    if ($Headers) { $params.Headers = $Headers }

    # Windows PowerShell 5.1 prompts unless -UseBasicParsing is set.
    if ($PSVersionTable.PSVersion.Major -lt 6) {
      $params.UseBasicParsing = $true
    }

    # Use Invoke-WebRequest so we can read StatusCode reliably
    $resp = Invoke-WebRequest @params
    return @{ Ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300); StatusCode = $resp.StatusCode; Content = $resp.Content }
  } catch {
    return @{ Ok = $false; StatusCode = 0; Content = $_.Exception.Message }
  }
}

function Wait-UntilOk {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][string]$Url,
    [int]$TimeoutSec,
    [hashtable]$Headers = $null
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $r = Invoke-HttpOk -Url $Url -TimeoutSec 5 -Headers $Headers
    if ($r.Ok) {
      Write-Step "OK: $Name ($Url)"
      return $r
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Name at $Url. LastStatus=$($r.StatusCode) LastError=$($r.Content)"
}

function Wait-PromTargetUp {
  param(
    [Parameter(Mandatory=$true)][string]$Job,
    [Parameter(Mandatory=$true)][string]$TargetsUrl,
    [int]$TimeoutSec
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $targetsJson = Invoke-RestMethod -Uri $TargetsUrl -Method GET -TimeoutSec 10
    $active = @($targetsJson.data.activeTargets)
    $nodeTargets = @($active | Where-Object { $_.labels.job -eq $Job })
    if ($nodeTargets.Count -lt 1) {
      Start-Sleep -Seconds 2
      continue
    }

    $down = @($nodeTargets | Where-Object { $_.health -ne 'up' })
    if ($down.Count -gt 0) {
      Start-Sleep -Seconds 2
      continue
    }

    return $nodeTargets
  } while ((Get-Date) -lt $deadline)

  $final = Invoke-RestMethod -Uri $TargetsUrl -Method GET -TimeoutSec 10
  $activeFinal = @($final.data.activeTargets)
  $nodeTargetsFinal = @($activeFinal | Where-Object { $_.labels.job -eq $Job })
  if ($nodeTargetsFinal.Count -lt 1) {
    throw "No activeTargets for job $Job. Found jobs: $((($activeFinal | ForEach-Object { $_.labels.job }) | Sort-Object -Unique) -join ', ')"
  }
  $details = @($nodeTargetsFinal | ForEach-Object { "health=$($_.health) scrapeUrl=$($_.scrapeUrl) lastError=$($_.lastError)" })
  throw "$Job target not up: $($details -join ' | ')"
}

function Dump-DockerLogs([int]$Tail) {
  Write-Host "---- docker compose ps ----"
  docker compose ps
  Write-Host "---- docker compose logs (tail=$Tail) ----"
  docker compose logs --tail=$Tail
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $root

try {
  Write-Step "E2E(debug): bring up compose stack"
  if ($Build) {
    Write-Step "E2E(debug): build node image"
    docker compose build node
  }

  if ($RemoveOrphans) {
    docker compose up -d --remove-orphans
  } else {
    docker compose up -d
  }

  Write-Step "E2E(debug): wait for node metrics endpoint"
  $metrics = Wait-UntilOk -Name 'node /metrics' -Url 'http://localhost:9091/metrics' -TimeoutSec $TimeoutSeconds

  Write-Step "E2E(debug): wait for Prometheus API"
  Wait-UntilOk -Name 'prometheus /api/v1/status/buildinfo' -Url 'http://localhost:9092/api/v1/status/buildinfo' -TimeoutSec $TimeoutSeconds | Out-Null

  Write-Step "E2E(debug): verify Prometheus can scrape kubercoin-node target"
  $nodeTargets = Wait-PromTargetUp -Job 'kubercoin-node' -TargetsUrl 'http://localhost:9092/api/v1/targets' -TimeoutSec $TimeoutSeconds
  Write-Step "OK: Prometheus target kubercoin-node is up"

  Write-Step "E2E(debug): verify PromQL query returns data"
  $q = [uri]::EscapeDataString('kubercoin_node_up')
  $query = Invoke-RestMethod -Uri "http://localhost:9092/api/v1/query?query=$q" -Method GET -TimeoutSec 10
  $result = @($query.data.result)
  if ($query.status -ne 'success' -or $result.Count -lt 1) {
    throw "PromQL query kubercoin_node_up returned no results. status=$($query.status)"
  }
  Write-Step "OK: PromQL kubercoin_node_up returned $($result.Count) series"

  Write-Step "E2E(debug): wait for Grafana health"
  # Grafana can be slow on first boot; give it the same timeout.
  Wait-UntilOk -Name 'grafana /api/health' -Url 'http://localhost:3000/api/health' -TimeoutSec $TimeoutSeconds | Out-Null

  $grafanaUser = if ($env:GRAFANA_USER) { $env:GRAFANA_USER } else { 'admin' }
  $grafanaPass = if ($env:GRAFANA_PASSWORD) { $env:GRAFANA_PASSWORD } else { 'admin' }
  $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$grafanaUser`:$grafanaPass"))
  $headers = @{ Authorization = "Basic $basic" }

  Write-Step "E2E(debug): verify Grafana datasource 'Prometheus' exists"
  $ds = Invoke-RestMethod -Uri 'http://localhost:3000/api/datasources' -Headers $headers -Method GET -TimeoutSec 10
  $prom = @($ds | Where-Object { $_.name -eq 'Prometheus' -and $_.type -eq 'prometheus' })
  if ($prom.Count -lt 1) {
    $names = ($ds | ForEach-Object { "$($_.name) ($($_.type))" }) -join ', '
    throw "Grafana datasource 'Prometheus' not found. Existing: $names"
  }
  Write-Step "OK: Grafana datasource Prometheus present"

  Write-Step "E2E(debug): verify provisioned dashboard exists"
  $search = Invoke-RestMethod -Uri 'http://localhost:3000/api/search?query=Kubercoin' -Headers $headers -Method GET -TimeoutSec 10
  if (-not $search -or $search.Count -lt 1) {
    # fall back to a broader search in case of naming differences
    $search = Invoke-RestMethod -Uri 'http://localhost:3000/api/search?query=kubercoin' -Headers $headers -Method GET -TimeoutSec 10
  }
  if (-not $search -or $search.Count -lt 1) {
    throw "Grafana dashboard search returned 0 results (query kubercoin)"
  }
  Write-Step "OK: Grafana dashboard search returned $($search.Count) item(s)"

  Write-Step "E2E(debug): PASS"

} catch {
  Write-Host "E2E(debug): FAIL"
  Write-Host $_
  Dump-DockerLogs -Tail $LogsTail
  exit 1
} finally {
  Pop-Location
}

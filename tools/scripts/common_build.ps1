function Resolve-Cargo {
  $cargo = Get-Command cargo -ErrorAction SilentlyContinue
  if ($cargo) { return $cargo.Source }

  $fallbacks = @()
  if ($env:CARGO_HOME) {
    $fallbacks += (Join-Path $env:CARGO_HOME "bin\cargo.exe")
  }
  if ($env:USERPROFILE) {
    $fallbacks += (Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe")
    $fallbacks += (Join-Path $env:USERPROFILE "scoop\persist\rustup\.cargo\bin\cargo.exe")
  }

  foreach ($fallback in $fallbacks) {
    if ($fallback -and (Test-Path $fallback)) {
      return $fallback
    }
  }

  throw "cargo was not found on PATH and no fallback cargo.exe was found"
}

function Resolve-WorkspaceRoot {
  param(
    [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot)
  )

  $candidate = $WorkspaceRoot
  try {
    $resolved = Resolve-Path $candidate -ErrorAction Stop
    $candidate = $resolved.Path
  } catch {
  }

  if (Test-Path (Join-Path $candidate "Cargo.toml")) {
    return $candidate
  }

  $parent = Split-Path -Parent $candidate
  if ($parent -and (Test-Path (Join-Path $parent "Cargo.toml"))) {
    return $parent
  }

  throw "Unable to resolve repository root from path: $WorkspaceRoot"
}

function Resolve-KubercoinExe {
  param(
    [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot)
  )

  $WorkspaceRoot = Resolve-WorkspaceRoot -WorkspaceRoot $WorkspaceRoot
  $candidates = @(
    (Join-Path $WorkspaceRoot "target\release\kubercoin-node.exe")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  return $null
}

function Stop-KubercoinProcesses {
  param(
    [int]$WaitTimeoutMs = 10000
  )

  $procs = @(
    Get-Process -Name "kubercoin" -ErrorAction SilentlyContinue
    Get-Process -Name "kubercoin-node" -ErrorAction SilentlyContinue
  )
  if ($procs.Count -eq 0) { return $false }

  foreach ($proc in $procs) {
    try {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }

  $deadline = (Get-Date).AddMilliseconds($WaitTimeoutMs)
  do {
    $remaining = @(
      Get-Process -Name "kubercoin" -ErrorAction SilentlyContinue
      Get-Process -Name "kubercoin-node" -ErrorAction SilentlyContinue
    )
    if ($remaining.Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)

  $remainingIds = @(
    @(
      Get-Process -Name "kubercoin" -ErrorAction SilentlyContinue
      Get-Process -Name "kubercoin-node" -ErrorAction SilentlyContinue
    ) | ForEach-Object { $_.Id }
  ) -join ", "
  throw "Timed out waiting for kubercoin process to exit. Remaining PID(s): $remainingIds"
}

function Wait-FileUnlocked {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$TimeoutMs = 10000
  )

  if (-not (Test-Path $Path)) { return $true }

  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  do {
    try {
      $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      $stream.Close()
      return $true
    } catch {
      Start-Sleep -Milliseconds 200
    }
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Get-PortOwningProcessIds {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  $getNetTcpConnection = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
  if (-not $getNetTcpConnection) { return @() }

  try {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) { return @() }

    return @(
      $connections |
        Where-Object { $_.OwningProcess -gt 0 } |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
  } catch {
    return @()
  }
}

function Test-PortOwnedByProcess {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][int]$ProcessId
  )

  $owners = @(Get-PortOwningProcessIds -Port $Port)
  return $owners -contains $ProcessId
}

function Invoke-NodeReleaseBuild {
  param(
    [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$StopRunningNode,
    [int]$UnlockTimeoutMs = 10000
  )

  $WorkspaceRoot = Resolve-WorkspaceRoot -WorkspaceRoot $WorkspaceRoot

  $targetExe = Join-Path $WorkspaceRoot "target\release\kubercoin-node.exe"

  if ($StopRunningNode) {
    $stopped = Stop-KubercoinProcesses -WaitTimeoutMs $UnlockTimeoutMs
    if ($stopped) {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not (Wait-FileUnlocked -Path $targetExe -TimeoutMs $UnlockTimeoutMs)) {
    throw "Timed out waiting for build output to unlock: $targetExe"
  }

  $cargo = Resolve-Cargo
  Push-Location $WorkspaceRoot
  try {
    & $cargo build -p kubercoin-node --release
    if ($LASTEXITCODE -ne 0) {
      throw "cargo build -p kubercoin-node --release failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}
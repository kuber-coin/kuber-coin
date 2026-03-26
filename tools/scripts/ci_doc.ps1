param()

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$Cargo = Resolve-Cargo

Push-Location $RepoRoot
try {
  $env:RUSTDOCFLAGS = '-D warnings'
  & $Cargo doc --workspace --no-deps
  if ($LASTEXITCODE -ne 0) {
    throw 'Rustdoc build failed'
  }
} finally {
  Pop-Location
}
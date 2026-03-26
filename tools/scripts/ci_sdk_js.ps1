param()

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)
$SdkDir = Join-Path $RepoRoot 'apps\sdk\packages\js'

Push-Location $SdkDir
try {
  node --test src/index.test.mjs
  if ($LASTEXITCODE -ne 0) {
    throw 'JS SDK tests failed'
  }

  node build.mjs
  if ($LASTEXITCODE -ne 0) {
    throw 'JS SDK build failed'
  }

  foreach ($path in @('dist/index.js', 'dist/index.cjs', 'dist/index.d.ts')) {
    if (-not (Test-Path $path)) {
      throw "Expected SDK build output missing: $path"
    }
  }
} finally {
  Pop-Location
}
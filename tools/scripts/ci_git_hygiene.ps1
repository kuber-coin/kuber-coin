[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common_build.ps1"

$RepoRoot = Resolve-WorkspaceRoot -WorkspaceRoot (Split-Path -Parent $PSScriptRoot)

$allowList = @(
  '.vscode/tasks.json',
  '.vscode/launch.json'
)

$denyRules = @(
  @{ Pattern = '(^|/)\.env(\..+)?$'; Reason = 'Local env/secrets file tracked'; AllowExample = $true },
  @{ Pattern = '(^|/)(node_modules|__pycache__|venv|\.venv)(/|$)'; Reason = 'Dependency or virtualenv directory tracked' },
  @{ Pattern = '(^|/)(target|reports|test-results|playwright-report|playwright-report-live|coverage)(/|$)'; Reason = 'Generated build/test artifact tracked' },
  @{ Pattern = '(^|/)\.vscode(/|$)'; Reason = 'Machine-local VS Code settings tracked' },
  @{ Pattern = '(^|/)\.idea(/|$)'; Reason = 'Machine-local IDE settings tracked' },
  @{ Pattern = '\.(log|tmp|sqlite|db|pem|key|cer|crt|pfx|p12|exe|dll|so|dylib|class|o)$'; Reason = 'Generated, sensitive, or machine-local file tracked' }
)

Push-Location $RepoRoot
try {
  $trackedFiles = @(git ls-files)
  if ($LASTEXITCODE -ne 0) {
    throw 'git ls-files failed'
  }

  $violations = @()

  foreach ($trackedFile in $trackedFiles) {
    $normalized = $trackedFile.Replace('\', '/')

    if ($allowList -contains $normalized) {
      continue
    }

    foreach ($rule in $denyRules) {
      if ($rule.ContainsKey('AllowExample') -and $rule.AllowExample -and $normalized -like '*.example') {
        continue
      }

      if ($normalized -match $rule.Pattern) {
        $violations += [pscustomobject]@{
          Path = $normalized
          Reason = $rule.Reason
        }
        break
      }
    }
  }

  if ($violations.Count -gt 0) {
    Write-Host 'Tracked-file hygiene violations detected:' -ForegroundColor Red
    $violations |
      Sort-Object Path |
      ForEach-Object {
        Write-Host (" - {0}: {1}" -f $_.Path, $_.Reason) -ForegroundColor Red
      }
    throw 'Repository hygiene check failed'
  }

  Write-Host 'Repository hygiene check passed' -ForegroundColor Green
} finally {
  Pop-Location
}
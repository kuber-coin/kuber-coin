param(
    [ValidateSet("table", "json")]
    [string]$Format = "table"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot "..") "..")).Path
$webRoot = Join-Path $repoRoot "apps\web"

function Get-FileTextOrEmpty {
    param([string]$Path)

    if (Test-Path $Path) {
        return Get-Content -LiteralPath $Path -Raw
    }

    return ""
}

$results = foreach ($appDir in Get-ChildItem -LiteralPath $webRoot -Directory) {
    $packageJsonPath = Join-Path $appDir.FullName "package.json"
    if (-not (Test-Path $packageJsonPath)) {
        continue
    }

    $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
    $packageLockPath = Join-Path $appDir.FullName "package-lock.json"
    $nextConfigJsPath = Join-Path $appDir.FullName "next.config.js"
    $nextConfigMjsPath = Join-Path $appDir.FullName "next.config.mjs"
    $tailwindJsPath = Join-Path $appDir.FullName "tailwind.config.js"
    $tailwindMjsPath = Join-Path $appDir.FullName "tailwind.config.mjs"

    $packageText = Get-FileTextOrEmpty -Path $packageJsonPath
    $packageLockText = Get-FileTextOrEmpty -Path $packageLockPath
    $nextConfigText = (Get-FileTextOrEmpty -Path $nextConfigJsPath) + (Get-FileTextOrEmpty -Path $nextConfigMjsPath)
    $tailwindText = (Get-FileTextOrEmpty -Path $tailwindJsPath) + (Get-FileTextOrEmpty -Path $tailwindMjsPath)

    $uiDependency = $null
    if ($packageJson.dependencies -and $packageJson.dependencies.'@kubercoin/ui') {
        $uiDependency = $packageJson.dependencies.'@kubercoin/ui'
    }

    [pscustomobject]@{
        App = $appDir.Name
        PackageName = $packageJson.name
        UsesUiDependency = $null -ne $uiDependency
        UiDependencySpec = if ($null -ne $uiDependency) { [string]$uiDependency } else { "" }
        UsesRepoRootUiPath = $null -ne $uiDependency -and [string]$uiDependency -match 'file:\.\./\.\./packages/ui'
        UsesVendoredUiTarball = $null -ne $uiDependency -and [string]$uiDependency -match 'file:\./vendor/.+\.tgz$'
        UsesPostinstallSync = $packageText -match 'sync-local-ui'
        UsesDirectUiAlias = $nextConfigText -match 'apps/packages/ui/src' -or $nextConfigText -match '@kubercoin/ui/styles'
        UsesTailwindUiSource = $tailwindText -match 'apps/packages/ui/src'
        LockfileResolvesVendoredUi = $packageLockText -match '"resolved":\s*"file:vendor/.+\.tgz"'
        LockfileHasRepoRootUiPath = $packageLockText -match 'file:\.\./\.\./packages/ui' -or $packageLockText -match 'file:\.\./packages/ui'
    }
}

if ($Format -eq "json") {
    $results | ConvertTo-Json -Depth 5
    exit 0
}

$results | Sort-Object App | Format-Table -AutoSize
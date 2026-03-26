param(
  [switch]$Clean,
  [switch]$Debug
)

$ErrorActionPreference = 'Stop'

$argList = @()
if ($Clean) {
  $argList += '--clean'
}
if ($Debug) {
  $argList += '--debug'
}

$joinedArgs = ($argList -join ' ')
$cmd = 'cd /mnt/c/kubercoin-export && bash tools/scripts/build_native_ui_linux.sh'
if (-not [string]::IsNullOrWhiteSpace($joinedArgs)) {
  $cmd = "$cmd $joinedArgs"
}

wsl.exe bash -lc $cmd
if ($LASTEXITCODE -ne 0) {
  throw 'WSL Linux native UI build failed'
}
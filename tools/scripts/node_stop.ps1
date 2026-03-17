param(
    [string]$ProcessName = "kubercoin"
)

$ErrorActionPreference = "Stop"

$procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($procs.Count -eq 0) {
    Write-Host "No $ProcessName process running."
    exit 0
}

$hadFailure = $false
foreach ($p in $procs) {
    try {
        Stop-Process -Id $p.Id -Force -ErrorAction Stop
        Write-Host ("Stopped {0} pid {1}" -f $ProcessName, $p.Id)
    } catch {
        $hadFailure = $true
        Write-Host ("Failed to stop pid {0}: {1}" -f $p.Id, $_.Exception.Message)
    }
}

if ($hadFailure) { exit 1 }
exit 0

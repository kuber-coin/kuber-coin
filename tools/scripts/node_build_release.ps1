param(
  [switch]$StopRunningNode
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common_build.ps1"

Invoke-NodeReleaseBuild -WorkspaceRoot (Split-Path -Parent $PSScriptRoot) -StopRunningNode:$StopRunningNode
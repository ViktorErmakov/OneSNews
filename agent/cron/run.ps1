# Windows Task Scheduler: daily
# powershell -ExecutionPolicy Bypass -File D:\Repo\News_OneS\agent\cron\run.ps1

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
$env:PYTHONPATH = Join-Path $Root "agent"

$Py = "python"
if (Test-Path (Join-Path $Root ".venv\Scripts\python.exe")) {
  $Py = Join-Path $Root ".venv\Scripts\python.exe"
}

& $Py (Join-Path $Root "agent\run.py") @args
exit $LASTEXITCODE

param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [string]$Destination = (Join-Path $PSScriptRoot '..\backups'),
  [int]$RetentionDays = 35
)

$ErrorActionPreference = 'Stop'
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $resolvedDestination | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $resolvedDestination "finverse-$stamp.dump"

& pg_dump --dbname=$DatabaseUrl --format=custom --compress=9 --file=$archive
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

& pg_restore --list $archive | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Backup archive validation failed.' }

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $resolvedDestination -Filter 'finverse-*.dump' -File |
  Where-Object LastWriteTime -lt $cutoff |
  Remove-Item -Force

Write-Output $archive

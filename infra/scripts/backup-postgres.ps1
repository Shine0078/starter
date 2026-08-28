param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [string]$Destination = (Join-Path $PSScriptRoot '..\backups'),
  [int]$RetentionDays = 35
)

$ErrorActionPreference = 'Stop'
$runningOnWindows = ($env:OS -eq 'Windows_NT') -or [bool]$IsWindows
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $resolvedDestination | Out-Null

if ($runningOnWindows) {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $resolvedDestination /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict backup directory ACLs.' }
} elseif (Get-Command chmod -ErrorAction SilentlyContinue) {
  & chmod 700 $resolvedDestination
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict backup directory permissions.' }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $resolvedDestination "finverse-$stamp.dump"

& pg_dump --dbname=$DatabaseUrl --format=custom --compress=9 --file=$archive
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

if ($runningOnWindows) {
  & icacls $archive /inheritance:r /grant:r "${identity}:F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict backup archive ACLs.' }
} elseif (Get-Command chmod -ErrorAction SilentlyContinue) {
  & chmod 600 $archive
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict backup archive permissions.' }
}

& pg_restore --list $archive | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Backup archive validation failed.' }

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $resolvedDestination -Filter 'finverse-*.dump' -File |
  Where-Object LastWriteTime -lt $cutoff |
  Remove-Item -Force

Write-Output $archive

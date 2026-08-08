param(
  [Parameter(Mandatory = $true)]
  [string]$Archive,
  [Parameter(Mandatory = $true)]
  [string]$RestoreDatabaseUrl
)

$ErrorActionPreference = 'Stop'
$archivePath = (Resolve-Path -LiteralPath $Archive).Path
$databaseName = ([Uri]$RestoreDatabaseUrl).AbsolutePath.Trim('/')

if ($databaseName -notmatch '_restore_test$') {
  throw 'RestoreDatabaseUrl database name must end in _restore_test; refusing to overwrite any other database.'
}

& pg_restore --dbname=$RestoreDatabaseUrl --clean --if-exists --no-owner $archivePath
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }

& psql $RestoreDatabaseUrl --no-psqlrc --tuples-only --command='SELECT count(*) FROM schema_migrations;'
if ($LASTEXITCODE -ne 0) { throw 'Restored database validation query failed.' }

Write-Output "Restore drill completed in $databaseName"

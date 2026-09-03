# Full logical backup of the PROD database, with optional mirror to the
# private `db-backups` Supabase bucket.
#
# Config (never commit secrets): a `.backup.env` file next to this script.
#   PGHOST              prod pooler host (session mode :5432)
#   PGPORT=5432
#   PGUSER              postgres.<project-ref>
#   PGPASSWORD          db password
#   UPLOAD_TO_BUCKET=1   (optional) also mirror the dump into `db-backups`
#   SERVICE_ROLE_KEY=    required only when UPLOAD_TO_BUCKET=1
#   RETENTION=12         keep the N most recent dumps (default 12)
#
# Schedule via Windows Task Scheduler (weekly, off-peak, e.g. Sun 03:00).

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $Root "backups"
$EnvFile = Join-Path $PSScriptRoot ".backup.env"
$PgBin = "C:\Program Files\PostgreSQL\17\bin"

if (-not (Test-Path $EnvFile)) { throw ".backup.env not found - copy .backup.env.example to .backup.env and fill it in." }

Get-Content $EnvFile | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } | ForEach-Object {
    $kv = $_ -split '=', 2
    Set-Item -Path ("env:" + $kv[0].Trim()) -Value $kv[1].Trim()
}

if (-not $env:PGHOST) { throw "PGHOST is required in .backup.env" }
if (-not $env:PGUSER) { throw "PGUSER is required in .backup.env" }
if (-not $env:PGPASSWORD) { throw "PGPASSWORD is required in .backup.env" }
if (-not $env:PGPORT) { $env:PGPORT = "5432" }
if (-not $env:RETENTION) { $env:RETENTION = "12" }

New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

$Pgdump = Join-Path $PgBin "pg_dump.exe"
if (-not (Test-Path $Pgdump)) { $Pgdump = "pg_dump" }
$Pgres  = Join-Path $PgBin "pg_restore.exe"

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutFile = Join-Path $BackupDir "hyperlocal_prod_$Stamp.backup"

Write-Output ">> Dumping PROD -> $OutFile"
$dumpArgs = @(
    "--host", $env:PGHOST,
    "--port", $env:PGPORT,
    "--username", $env:PGUSER,
    "--dbname", "postgres",
    "--format", "custom",
    "--no-owner",
    "--no-privileges",
    "--file", $OutFile
)
& $Pgdump @dumpArgs
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

Write-Output ">> Verifying archive"
if (Test-Path $Pgres) {
    & $Pgres --list $OutFile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "pg_restore --list verification failed" }
}

$Hash = (Get-FileHash $OutFile -Algorithm SHA256).Hash
$Info = [ordered]@{
    file      = Split-Path $OutFile -Leaf
    path      = $OutFile
    size_bytes = (Get-Item $OutFile).Length
    sha256    = $Hash
    created_at = (Get-Date).ToUniversalTime().ToString("o")
}
$Info | ConvertTo-Json | Set-Content -Path (Join-Path $BackupDir "latest.json") -Encoding UTF8
Write-Output ">> sha256: $Hash"

$Retention = [int]$env:RETENTION
if ($Retention -gt 0) {
    $Old = Get-ChildItem $BackupDir -Filter "hyperlocal_prod_*.backup" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Retention
    foreach ($f in $Old) {
        Write-Output ">> Pruning $($f.Name)"
        Remove-Item $f.FullName -Force
    }
}

if ($env:UPLOAD_TO_BUCKET -eq "1") {
    if (-not $env:SERVICE_ROLE_KEY) { throw "SERVICE_ROLE_KEY is required when UPLOAD_TO_BUCKET=1" }
    $Name = Split-Path $OutFile -Leaf
    if ($env:PGUSER -match '\.([a-z0-9]{20})\.') { $Proj = $matches[1] } else { throw "cannot derive project ref from PGUSER" }
    Write-Output ">> Uploading $Name to $Proj/db-backups"
    & curl.exe -sS -X POST "https://$Proj.supabase.co/storage/v1/object/db-backups/$Name" `
        -H "Authorization: Bearer $env:SERVICE_ROLE_KEY" `
        -H "Content-Type: application/octet-stream" `
        --data-binary "@$OutFile"
    if ($LASTEXITCODE -ne 0) { throw "bucket upload failed" }
    Write-Output ""
}

Write-Output ">> Backup complete."
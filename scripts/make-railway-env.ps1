$ErrorActionPreference = 'Stop'
$root = 'C:\Users\Home\ip add tracer\cybernet'

$map = @{}
Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '=' } | ForEach-Object {
    $i = $_.IndexOf('=')
    $map[$_.Substring(0, $i).Trim()] = $_.Substring($i + 1).Trim().Trim('"')
}

$sa  = $map['FIREBASE_SERVICE_ACCOUNT']
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sa))

$buildKeys = @(
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
)

$lines = @()
$lines += '# Railway environment variables for CYBERNET'
$lines += '# Paste each NAME=VALUE into your Railway service -> Variables tab.'
$lines += '# This file is gitignored (.env.*). Never commit it.'
$lines += ''
$lines += '# ---- BUILD VARIABLES ----'
$lines += '# Vite inlines these at BUILD time. The build fails if any are missing.'
$lines += '# Public client values; they already ship in the browser bundle.'
foreach ($k in $buildKeys) { $lines += ($k + '=' + $map[$k]) }
$lines += ''
$lines += '# ---- RUNTIME VARIABLE ----'
$lines += '# Required or every request returns 401. Keep secret.'
$lines += ('FIREBASE_SERVICE_ACCOUNT_BASE64=' + $b64)
$lines += ''
$lines += '# ---- OPTIONAL TUNING (add only if you need them) ----'
$lines += '# TRUST_PROXY=true'
$lines += '# SSE_METRICS_INTERVAL_MS=10000'
$lines += '# EVENT_RETENTION_DAYS=30'
$lines += '# LOG_MAX_BYTES=5242880'
$lines += '# REQUEST_RATE_LIMIT=30'

$outPath = Join-Path $root '.env.railway'
Set-Content -LiteralPath $outPath -Value $lines -Encoding UTF8

# Round-trip check on the secret we just wrote
$roundTrip = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json

Write-Output ('written: ' + $outPath)
Write-Output ('lines  : ' + $lines.Count)
Write-Output ('bytes  : ' + (Get-Item $outPath).Length)
Write-Output ('check  : project_id=' + $roundTrip.project_id + ' key_newlines=' + ([regex]::Matches($roundTrip.private_key, "`n")).Count)
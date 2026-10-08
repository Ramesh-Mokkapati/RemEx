# Source this from PowerShell to enable HTTPS for all RMX services.
#   . .\enable-https.ps1
Get-Content (Join-Path $PSScriptRoot 'enable-https.env') | ForEach-Object {
  if ($_ -match '^\s*#') { return }
  if ($_ -match '^\s*$') { return }
  $kv = $_ -split '=', 2
  if ($kv.Count -eq 2) {
    [Environment]::SetEnvironmentVariable($kv[0].Trim(), $kv[1].Trim(), 'Process')
  }
}
Write-Host "RMX HTTPS environment loaded. Keystore: $env:KEYSTORE_PATH"
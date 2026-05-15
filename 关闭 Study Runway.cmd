@echo off
setlocal

set "ROOT=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root='%ROOT%';" ^
  "$targets = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^node(\\.exe)?$' -and $_.CommandLine -like '*scripts/local-server.mjs*' -and $_.CommandLine -like ('*' + $root.Replace('\', '\\') + '*') };" ^
  "if ($targets) { $targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Host 'Study Runway local server stopped.' } else { Write-Host 'No Study Runway local server is running.' }"

pause

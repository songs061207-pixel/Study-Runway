@echo off
setlocal

set "ROOT=%~dp0"
set "PORT=4173"
set "URL=http://127.0.0.1:%PORT%/dashboard"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"

cd /d "%ROOT%"

if not exist "%ROOT%dist\index.html" (
  echo First launch needs a production build. This may take a moment...
  call "%NPM_CMD%" run build
  if errorlevel 1 (
    echo Build failed. Press any key to close.
    pause >nul
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
  "$port=%PORT%; $url='%URL%'; $root='%ROOT%'; $node='%NODE_EXE%'; $serverScript='scripts/local-server.mjs';" ^
  "try { $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop } catch { $listener = $null };" ^
  "if (-not $listener) { Start-Process -WindowStyle Hidden -FilePath $node -ArgumentList $serverScript -WorkingDirectory $root | Out-Null; Start-Sleep -Milliseconds 800 };" ^
  "Start-Process $url | Out-Null"

exit /b 0

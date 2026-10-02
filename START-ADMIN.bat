@echo off
title Fairy Peony - Shop the Look admin
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is needed once. Opening the download page...
  echo  Install the LTS version, then double-click this file again.
  start https://nodejs.org
  pause
  exit /b
)
start "" http://localhost:4320
node tools\looks-admin\server.js
pause

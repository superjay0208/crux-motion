@echo off
setlocal
cd /d "%~dp0game"
where node >nul 2>nul
if errorlevel 1 (
  "D:\Climbing\tools\node\node.exe" scripts\launch.mjs
) else (
  node scripts\launch.mjs
)
if errorlevel 1 pause

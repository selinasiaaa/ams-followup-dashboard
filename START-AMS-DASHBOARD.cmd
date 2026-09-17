@echo off
setlocal
cd /d "%~dp0"
title AMS Dashboard Server
echo Starting AMS Dashboard from:
echo %~dp0
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-office-dashboard.ps1"
echo.
echo The dashboard has stopped. Review any message above.
pause

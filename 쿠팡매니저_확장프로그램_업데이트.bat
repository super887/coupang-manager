@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0extension\update.ps1"
exit /b 0

@echo off
chcp 65001 >nul
title KP Sortiment - Update

rem Einmal verteilen, danach nie wieder verschicken: diese Datei holt das
rem eigentliche Update-Skript frisch aus dem Repo und fuehrt es aus. So kann
rem sich der Ablauf spaeter aendern, ohne dass jemand eine neue Datei braucht.

set PS1URL=https://raw.githubusercontent.com/andrkumbi-droid/kp-wallpanel/main/meta-assistant/tools/kp-update.ps1

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $t=Join-Path $env:TEMP 'kp-update.ps1'; Invoke-WebRequest -Uri $env:PS1URL -OutFile $t -UseBasicParsing -Headers @{'Cache-Control'='no-cache'}; & $t"

if errorlevel 1 (
  echo.
  echo   Fehler beim Update - bitte Andre Bescheid sagen.
)
echo.
pause

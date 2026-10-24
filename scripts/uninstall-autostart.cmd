@echo off
rem Supprime le demarrage automatique du bot.
set "LAUNCHER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\iltak-bot.cmd"

if exist "%LAUNCHER%" (
  del "%LAUNCHER%"
  echo Demarrage automatique supprime.
) else (
  echo Aucun demarrage automatique installe.
)
pause

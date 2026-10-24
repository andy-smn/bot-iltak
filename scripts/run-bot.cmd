@echo off
setlocal EnableDelayedExpansion
rem Lance le bot Iltak et le relance automatiquement s'il s'arrete sur une erreur
rem (par exemple si le reseau n'est pas encore pret au demarrage de Windows).
rem Un arret propre (commande console "stop" ou Ctrl+C) termine le script.
rem Pour tout arreter : tapez "stop" dans cette fenetre ou fermez-la.
title Bot Iltak
cd /d "%~dp0.."

for /l %%i in (1,1,100000) do (
  node src\index.js
  if "!errorlevel!"=="0" exit /b 0
  echo [ILTAK] Le bot s'est arrete sur une erreur ^(code !errorlevel!^). Nouvelle tentative dans 15 secondes...
  ping -n 16 127.0.0.1 >nul
)

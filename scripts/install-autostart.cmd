@echo off
rem Installe le demarrage automatique du bot a l'ouverture de session Windows.
rem Place un lanceur dans le dossier Demarrage de l'utilisateur ; le bot s'ouvre
rem dans une fenetre reduite (cliquez dessus pour utiliser la console : set-mj, stop...).
set "LAUNCHER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\iltak-bot.cmd"

> "%LAUNCHER%" echo @echo off
>> "%LAUNCHER%" echo start "Bot Iltak" /min cmd /c ""%~dp0run-bot.cmd""

echo Demarrage automatique installe : %LAUNCHER%
echo Le bot se lancera a la prochaine ouverture de session Windows.
pause

@echo off
setlocal
cd /d "%~dp0"
title xxxx prepara

where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 20 from https://nodejs.org then open CMD again.
  echo Installa Node.js 20 da https://nodejs.org e riapri CMD.
  if /I not "%1"=="nopause" pause
  exit /b 1
)

echo [1/2] Packages / Pacchetti...
call npm install
if errorlevel 1 goto fail

if not exist ".env" copy /Y ".env.example" ".env" >nul

echo [2/2] Database...
call node scripts\prepare.mjs
if errorlevel 1 goto fail

echo.
echo OK.
echo Next / Dopo: close the old admin window, then run xxxx Admin.bat
echo Chiudi il pannello vecchio, poi apri xxxx Admin.bat
if /I not "%1"=="nopause" pause
exit /b 0

:fail
echo.
echo ERROR. Read the lines above. / ERRORE. Leggi le righe sopra.
if /I not "%1"=="nopause" pause
exit /b 1

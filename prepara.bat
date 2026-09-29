@echo off
setlocal
cd /d "%~dp0"
title xxxx prepara

where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 20 from https://nodejs.org then open CMD again.
  echo Installa Node.js 20 da https://nodejs.org e riapri CMD.
  pause
  exit /b 1
)

echo [1/4] Packages / Pacchetti...
call npm install
if errorlevel 1 goto fail

if not exist ".env" copy /Y ".env.example" ".env" >nul

echo [2/4] Database...
set "DB_OK=0"
where wsl.exe >nul 2>&1
if errorlevel 1 goto no_wsl
for /f "delims=" %%I in ('wsl.exe wslpath -a "%CD%\scripts\align-ixm.sql"') do set "SQL=%%I"
wsl.exe -u postgres -e bash -lc "psql -h /tmp -d postgres -v ON_ERROR_STOP=1 -f '%SQL%' && (psql -h /tmp -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='infinity_x'\" | grep -q 1 || createdb -h /tmp -O ixm infinity_x)"
if errorlevel 1 goto no_wsl
set "DB_OK=1"
goto redis

:no_wsl
echo No WSL Postgres. The admin app will start its own database.
echo Niente Postgres WSL. Il pannello avvia il database da solo.

:redis
echo [3/4] Redis...
where wsl.exe >nul 2>&1
if errorlevel 1 goto tables
wsl.exe -e bash -lc "redis-cli ping || redis-server --daemonize yes"

:tables
if not "%DB_OK%"=="1" goto done
echo [4/4] Tables / Tabelle...
call npx prisma migrate deploy --schema prisma/schema.prisma
if errorlevel 1 goto fail

:done
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

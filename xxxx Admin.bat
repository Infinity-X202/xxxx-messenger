@echo off
title xxxx Admin Panel
cd /d "%~dp0"
node apps\desktop\control.mjs
if errorlevel 1 pause

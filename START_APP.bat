@echo off
cd /d "%~dp0"
title Delete My Tweets

REM Clear ELECTRON_RUN_AS_NODE (may be inherited from VS Code/other Electron apps)
set ELECTRON_RUN_AS_NODE=

REM Check if electron is installed
if not exist "node_modules\electron\dist\electron.exe" (
    echo Installing dependencies...
    call npm install
)

REM Launch Delete My Tweets GUI app with explicit main file
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0electron-main.js"

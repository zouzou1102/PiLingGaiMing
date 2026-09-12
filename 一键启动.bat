@echo off
setlocal
title MaoDie Renamer - DEV launcher

rem ---------------------------------------------------------------
rem  One-click launcher for DEVELOPMENT.
rem  Runs the app straight from source (electron-vite dev):
rem    - renderer changes apply instantly (HMR)
rem    - main / preload changes restart Electron automatically
rem  So: fix a bug -> change the file -> just look at the window.
rem  No packaging, no rebuild. Close this window to stop the app.
rem
rem  Keep this file ASCII-only: cmd.exe reads .bat using the local
rem  code page, so non-ASCII text inside can be parsed incorrectly.
rem ---------------------------------------------------------------

rem Always work from the folder that contains this file, then enter the app.
cd /d "%~dp0maodie-renamer"

rem Mirrors: Electron's binary download stalls without them.
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

echo ============================================================
echo   MaoDie Renamer  -  DEV launcher
echo ------------------------------------------------------------
echo   Runs from source. Edit a file and it takes effect at once.
echo   Nothing to package. Close this window to stop the app.
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist package.json goto noproj

if not exist node_modules goto install
goto run

:install
echo [1/2] First run: installing dependencies (one time only)...
echo.
call npm install
if errorlevel 1 goto installfail
echo.

:run
echo [2/2] Starting dev mode...
echo.
call npm run dev
echo.
echo ------------------------------------------------------------
echo   Dev process exited.
echo ------------------------------------------------------------
pause
goto end

:nonode
echo [ERROR] Node.js was not found.
echo         Install Node.js first, then double-click this file again.
echo.
pause
goto end

:noproj
echo [ERROR] package.json was not found. Expected it at:
echo         %cd%\package.json
echo.
pause
goto end

:installfail
echo [ERROR] npm install failed. Check your network, then try again.
echo.
pause

:end
endlocal

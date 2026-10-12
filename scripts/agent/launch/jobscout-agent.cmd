@echo off
rem ===================================================================
rem  JobScout Agent - the file a person downloads and double-clicks.
rem
rem  This is deliberately tiny and dumb. It fetches the current agent
rem  and runs it, which means a customer is never running last month's
rem  build and we never have to ask anybody to update anything.
rem
rem  There is nothing to type and no token to paste: the agent opens a
rem  browser, the person presses Connect on a page they are already
rem  signed in to, and that is the whole setup.
rem
rem  The release URL and the public key are filled in when this is
rem  published, so the copy in the repo is not tied to one environment.
rem ===================================================================
setlocal enableextensions
title JobScout Agent

set "BASE=__BASE__"
set "APP=__APP__"
set "DIR=%LOCALAPPDATA%\JobScout\agent"

echo.
echo    JobScout Agent
echo    ==============
echo.

if not exist "%DIR%" mkdir "%DIR%" >nul 2>&1

rem --- Node ----------------------------------------------------------
rem Nobody downloading this has any reason to know what Node is, so if
rem it is missing we install it rather than explaining it.
set "NODE=node"
where node >nul 2>&1
if not errorlevel 1 goto have_node

echo    First run on this computer - installing what it needs.
echo    This takes a minute or two and only ever happens once.
echo.
where winget >nul 2>&1
if errorlevel 1 goto no_winget
winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
echo.

rem winget cannot change the PATH of a window that is already open, so
rem look where it puts things rather than asking the person to reopen.
where node >nul 2>&1
if not errorlevel 1 goto have_node
if exist "%ProgramFiles%\nodejs\node.exe" goto node_in_pf
if exist "%ProgramFiles(x86)%\nodejs\node.exe" goto node_in_pf86

echo    Installed, but this window cannot see it yet.
echo    Close this window, open the file again, and it will work.
echo.
pause
exit /b 0

:node_in_pf
set "NODE=%ProgramFiles%\nodejs\node.exe"
goto have_node

:node_in_pf86
set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"
goto have_node

:no_winget
echo    This computer needs Node and cannot install it automatically.
echo    Opening the download page - install it, then open this file again.
echo.
start "" https://nodejs.org/en/download
pause
exit /b 1

:have_node

rem --- the agent itself ----------------------------------------------
rem Fetched every run. A failed download must not leave a half-written
rem agent behind, so each file lands as .new and is moved into place.
echo    Getting the latest version...
curl -fsSL -o "%DIR%\agent.mjs.new" "%BASE%/agent.mjs"
if errorlevel 1 goto offline
curl -fsSL -o "%DIR%\recorder.ps1.new" "%BASE%/recorder.ps1"
if errorlevel 1 goto offline
move /y "%DIR%\agent.mjs.new" "%DIR%\agent.mjs" >nul
move /y "%DIR%\recorder.ps1.new" "%DIR%\recorder.ps1" >nul
goto run

:offline
del "%DIR%\agent.mjs.new" >nul 2>&1
del "%DIR%\recorder.ps1.new" >nul 2>&1
if exist "%DIR%\agent.mjs" (
  echo    Could not check for a new version - carrying on with the one
  echo    already on this computer.
  goto run
)
echo    Could not reach JobScout, and there is nothing downloaded yet.
echo    Check the internet connection and open this file again.
echo.
pause
exit /b 1

:run
echo.
set "JOBSCOUT_URL=__SUPABASE_URL__"
set "JOBSCOUT_ANON_KEY=__ANON_KEY__"
set "JOBSCOUT_APP_URL=%APP%"
"%NODE%" "%DIR%\agent.mjs"

rem The agent only returns when it is stopped. Hold the window so that
rem whatever it said last is still readable.
echo.
echo    Arnie has stopped on this computer.
echo.
pause

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
rem NOTHING HERE MAY ASK FOR ADMIN.
rem
rem This used to run `winget install OpenJS.NodeJS.LTS`, which installs
rem machine-wide into Program Files and therefore needs administrator
rem rights. On a work computer the person sitting at it usually is not an
rem administrator, so Windows threw a credential box over the top of
rem everything - and on a machine with Windows Hello that box asks for a
rem PIN. Doug reported exactly that: "Dougs computer is asking for a pin".
rem He had no way to answer it, and the install stopped dead.
rem
rem So Node is not INSTALLED at all now. The official zip is unpacked
rem into our own folder under LOCALAPPDATA, which needs no rights beyond
rem the ones every user already has over their own profile. It also fixes
rem the other rough edge: winget could not change the PATH of a window
rem that was already open, so the old script sometimes had to ask people
rem to close it and start again.
set "NODE=node"
where node >nul 2>&1
if not errorlevel 1 goto have_node
if exist "%DIR%\node\node.exe" goto node_ours

echo    First run on this computer - getting what it needs.
echo    About a minute, and only this once. Nothing is installed and
echo    nothing will ask for a password.
echo.

rem One PowerShell call: newest LTS from nodejs.org, unpacked beside the
rem agent. Single quotes throughout - the whole thing is already inside
rem double quotes, and a double quote in here ends the argument early.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $d='%DIR%'; $i=Invoke-RestMethod 'https://nodejs.org/dist/index.json'; $v=($i | Where-Object { $_.lts -and $_.files -contains 'win-x64-zip' })[0].version; $z=Join-Path $env:TEMP ('jobscout-node-'+$v+'.zip'); $t=Join-Path $env:TEMP ('jobscout-node-'+$v); Invoke-WebRequest -UseBasicParsing ('https://nodejs.org/dist/'+$v+'/node-'+$v+'-win-x64.zip') -OutFile $z; if (Test-Path $t) { Remove-Item $t -Recurse -Force }; Expand-Archive $z $t -Force; $s=(Get-ChildItem $t -Directory)[0].FullName; $dest=Join-Path $d 'node'; if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }; Move-Item $s $dest; Remove-Item $z -Force -ErrorAction SilentlyContinue; Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue; exit 0 } catch { Write-Host ('    ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 goto no_node
if exist "%DIR%\node\node.exe" goto node_ours

:no_node
echo.
echo    Could not fetch what it needs automatically.
echo    Opening the Node download page - install it, then open this
echo    file again.
echo.
start "" https://nodejs.org/en/download
pause
exit /b 1

:node_ours
set "NODE=%DIR%\node\node.exe"
goto have_node

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

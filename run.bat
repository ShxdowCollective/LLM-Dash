@echo off
rem LLM-Dash - Windows launcher.
rem Creates/uses a repo-local .venv, installs deps, starts uvicorn, opens the browser.
rem Use --silent to detach the server and print the URL for startup tasks.

setlocal enableextensions

cd /d "%~dp0"

if "%LLM_DASH_PORT%"=="" (set "PORT=8787") else (set "PORT=%LLM_DASH_PORT%")
if "%LLM_DASH_HOST%"=="" (set "HOST=127.0.0.1") else (set "HOST=%LLM_DASH_HOST%")
set "URL=http://%HOST%:%PORT%"
set "VENV=%~dp0.venv"
set "SYS_PY="
set "SILENT=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--silent" (
  set "SILENT=1"
  shift
  goto parse_args
)
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage
echo LLM-Dash: unknown argument: %~1 1>&2
goto usage_error

:usage
echo Usage: run.bat [--silent]
echo Environment: LLM_DASH_HOST=127.0.0.1 LLM_DASH_PORT=8787
exit /b 0

:usage_error
echo Usage: run.bat [--silent] 1>&2
exit /b 2

:args_done

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  set "SYS_PY=py -3"
) else (
  where python >nul 2>&1
  if %ERRORLEVEL%==0 (
    set "SYS_PY=python"
  )
)

if "%SYS_PY%"=="" (
  echo LLM-Dash: could not find "py -3" or "python" on PATH.
  echo Install Python 3.10+ from https://www.python.org/downloads/ and retry.
  if "%SILENT%"=="0" pause
  exit /b 1
)

if not exist "%VENV%\Scripts\python.exe" (
  if "%SILENT%"=="0" echo LLM-Dash: creating virtualenv at %VENV%
  %SYS_PY% -m venv "%VENV%"
  if errorlevel 1 (
    echo LLM-Dash: "python -m venv" failed. Confirm your Python install includes venv.
    if "%SILENT%"=="0" pause
    exit /b 1
  )
)

set "PY=%VENV%\Scripts\python.exe"
set "PIP=%VENV%\Scripts\pip.exe"

"%PY%" -m pip install --quiet --upgrade pip >nul
"%PIP%" install --quiet -r requirements.txt
if errorlevel 1 (
  echo LLM-Dash: dependency install failed. See message above.
  if "%SILENT%"=="0" pause
  exit /b 1
)

if "%SILENT%"=="1" (
  goto silent_launch
)

echo LLM-Dash: starting uvicorn on %URL%
start "LLM-Dash browser" cmd /c "powershell -NoProfile -Command ^
  \"$url = '%URL%'; for ($i=0; $i -lt 40; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri ($url + '/api/bootstrap-status') ^| Out-Null; Start-Process $url; break } catch { Start-Sleep -Milliseconds 250 } }\""

"%PY%" -m uvicorn server:app --host %HOST% --port %PORT%
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%

:silent_launch
"%PY%" scripts\launch_server.py --host "%HOST%" --port "%PORT%"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%

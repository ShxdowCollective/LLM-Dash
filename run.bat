@echo off
rem LLM-Dash - Windows launcher.
rem Creates/uses a repo-local .venv, installs deps, starts uvicorn, opens the browser.
rem Use --silent to detach the server and print the URL for startup tasks.
rem Use --reset to clear local settings/data and open the setup wizard.

setlocal enableextensions

set "SCRIPT_DIR=%~dp0"

if /I "%SCRIPT_DIR:~0,16%"=="\\wsl.localhost\" goto wsl_unc
if /I "%SCRIPT_DIR:~0,7%"=="\\wsl$\" goto wsl_unc_legacy

cd /d "%SCRIPT_DIR%"

if "%LLM_DASH_PORT%"=="" (set "PORT=8787") else (set "PORT=%LLM_DASH_PORT%")
if "%LLM_DASH_HOST%"=="" (set "HOST=127.0.0.1") else (set "HOST=%LLM_DASH_HOST%")
set "URL=http://%HOST%:%PORT%"
set "OPEN_URL=%URL%"
set "VENV=%~dp0.venv"
set "SYS_PY="
set "SILENT=0"
set "RESET=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--silent" (
  set "SILENT=1"
  shift
  goto parse_args
)
if /I "%~1"=="--reset" (
  set "RESET=1"
  shift
  goto parse_args
)
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage
echo LLM-Dash: unknown argument: %~1 1>&2
goto usage_error

:usage
echo Usage: run.bat [--silent] [--reset]
echo Environment: LLM_DASH_HOST=127.0.0.1 LLM_DASH_PORT=8787
exit /b 0

:usage_error
echo Usage: run.bat [--silent] [--reset] 1>&2
exit /b 2

:args_done

if "%SILENT%"=="1" if "%RESET%"=="1" (
  echo LLM-Dash: --reset opens the setup wizard and cannot be combined with --silent. 1>&2
  exit /b 2
)

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

if "%RESET%"=="1" (
  "%PY%" scripts\reset_local_state.py
  if errorlevel 1 (
    echo LLM-Dash: reset failed. See message above.
    if "%SILENT%"=="0" pause
    exit /b 1
  )
  set "OPEN_URL=%URL%/?reset=1"
)

if "%SILENT%"=="1" (
  goto silent_launch
)

echo LLM-Dash: starting uvicorn on %URL%
start "LLM-Dash browser" cmd /c "powershell -NoProfile -Command ^
  \"$probe = '%URL%'; $open = '%OPEN_URL%'; for ($i=0; $i -lt 40; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri ($probe + '/api/bootstrap-status') ^| Out-Null; Start-Process $open; break } catch { Start-Sleep -Milliseconds 250 } }\""

"%PY%" -m uvicorn server:app --host %HOST% --port %PORT%
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%

:silent_launch
"%PY%" scripts\launch_server.py --host "%HOST%" --port "%PORT%"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%

:wsl_unc
set "UNC_REMAINDER=%SCRIPT_DIR:~16%"
goto wsl_delegate

:wsl_unc_legacy
set "UNC_REMAINDER=%SCRIPT_DIR:~7%"

:wsl_delegate
for /f "tokens=1* delims=\" %%A in ("%UNC_REMAINDER%") do (
  set "WSL_DISTRO=%%A"
  set "WSL_PATH=%%B"
)

if "%WSL_DISTRO%"=="" (
  echo LLM-Dash: could not parse WSL distro from %SCRIPT_DIR% 1>&2
  exit /b 1
)
if "%WSL_PATH%"=="" (
  echo LLM-Dash: could not parse WSL path from %SCRIPT_DIR% 1>&2
  exit /b 1
)

where wsl.exe >nul 2>&1
if errorlevel 1 (
  echo LLM-Dash: this repo is on a WSL UNC path, but wsl.exe is not available. 1>&2
  exit /b 1
)

set "WSL_PATH=/%WSL_PATH:\=/%"
if defined WSLENV (
  set "WSLENV=LLM_DASH_HOST/u:LLM_DASH_PORT/u:%WSLENV%"
) else (
  set "WSLENV=LLM_DASH_HOST/u:LLM_DASH_PORT/u"
)

echo LLM-Dash: detected WSL path; launching via %WSL_DISTRO%:%WSL_PATH%
wsl.exe -d %WSL_DISTRO% --cd "%WSL_PATH%" -- bash ./run.sh %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%

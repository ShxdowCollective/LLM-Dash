@echo off
rem LLM-Dash - Windows launcher.
rem Creates/uses a repo-local .venv, installs deps, starts uvicorn, opens the browser.

setlocal enableextensions

cd /d "%~dp0"

if "%LLM_DASH_PORT%"=="" (set "PORT=8787") else (set "PORT=%LLM_DASH_PORT%")
set "URL=http://127.0.0.1:%PORT%"
set "VENV=%~dp0.venv"
set "SYS_PY="

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
  pause
  exit /b 1
)

if not exist "%VENV%\Scripts\python.exe" (
  echo LLM-Dash: creating virtualenv at %VENV%
  %SYS_PY% -m venv "%VENV%"
  if errorlevel 1 (
    echo LLM-Dash: "python -m venv" failed. Confirm your Python install includes venv.
    pause
    exit /b 1
  )
)

set "PY=%VENV%\Scripts\python.exe"
set "PIP=%VENV%\Scripts\pip.exe"

"%PY%" -m pip install --quiet --upgrade pip >nul
"%PIP%" install --quiet -r requirements.txt
if errorlevel 1 (
  echo LLM-Dash: dependency install failed. See message above.
  pause
  exit /b 1
)

echo LLM-Dash: starting uvicorn on %URL%
start "LLM-Dash browser" cmd /c "powershell -NoProfile -Command ^
  \"$url = '%URL%'; for ($i=0; $i -lt 40; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri ($url + '/api/bootstrap-status') ^| Out-Null; Start-Process $url; break } catch { Start-Sleep -Milliseconds 250 } }\""

"%PY%" -m uvicorn server:app --host 127.0.0.1 --port %PORT%

endlocal

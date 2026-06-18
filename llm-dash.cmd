@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if /I "%SCRIPT_DIR:~0,16%"=="\\wsl.localhost\" goto wsl_unc
if /I "%SCRIPT_DIR:~0,7%"=="\\wsl$\" goto wsl_unc_legacy
cd /d "%SCRIPT_DIR%"
if exist "%SCRIPT_DIR%.venv\Scripts\python.exe" (
  "%SCRIPT_DIR%.venv\Scripts\python.exe" -m llm_dash %*
) else (
  where py >nul 2>&1
  if %ERRORLEVEL%==0 (
    py -3 -m llm_dash %*
  ) else (
    python -m llm_dash %*
  )
)
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
where wsl.exe >nul 2>&1
if errorlevel 1 (
  echo LLM-Dash: this repo is on a WSL UNC path, but wsl.exe is not available. 1>&2
  exit /b 1
)
set "WSL_PATH=/%WSL_PATH:\=/%"
wsl.exe -d %WSL_DISTRO% --cd "%WSL_PATH%" -- bash ./llm-dash %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%

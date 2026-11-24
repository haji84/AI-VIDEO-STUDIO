@echo off
setlocal DisableDelayedExpansion

pushd "%~dp0" || exit /b 1
where.exe node.exe >nul 2>&1
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where.exe node.exe >nul 2>&1
if errorlevel 1 (
    >&2 echo Node.js was not found. See apps\local-editor\README.md for setup.
    popd
    exit /b 1
)

if not defined AIVS_PYTHON if exist "%CD%\.venv\Scripts\python.exe" set "AIVS_PYTHON=%CD%\.venv\Scripts\python.exe"
if not defined AIVS_PYTHON (
    where.exe py.exe >nul 2>&1
    if not errorlevel 1 set "AIVS_PYTHON=py.exe"
)

if not defined AIVS_GOOGLE_PHOTOS_CLIENT_FILE if exist "%LOCALAPPDATA%\AI VIDEO STUDIO\google-photos-client.json" set "AIVS_GOOGLE_PHOTOS_CLIENT_FILE=%LOCALAPPDATA%\AI VIDEO STUDIO\google-photos-client.json"

node.exe apps\local-editor\server.mjs --workspace "%USERPROFILE%\AI_VIDEO_STUDIO_DATA" --open-browser %*
set "aivs_result=%ERRORLEVEL%"
popd
exit /b %aivs_result%

@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AI VIDEO STUDIO - Initial setup

echo =====================================================
echo       AI VIDEO STUDIO - One-time setup

echo =====================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 goto check_ffmpeg
where python >nul 2>nul
if %errorlevel%==0 goto check_ffmpeg

echo Python 3 was not found.
echo.
echo Install Python from https://www.python.org/downloads/windows/
echo The installer should enable Add Python to PATH.
echo No installation is started automatically.
echo.
start "" "https://www.python.org/downloads/windows/"
pause
exit /b 1

:check_ffmpeg
where ffmpeg >nul 2>nul
if %errorlevel%==0 goto check_ffprobe
if exist "%~dp0tools\ffmpeg\bin\ffmpeg.exe" goto ready

echo FFmpeg was not found. Windows can install it with winget.
echo This is an optional third-party package and may modify your user PATH.
where winget >nul 2>nul
if errorlevel 1 (
    echo winget is unavailable. Install FFmpeg manually from https://ffmpeg.org/download.html
    start "" "https://ffmpeg.org/download.html"
    pause
    exit /b 1
)
echo.
choice /M "Install free FFmpeg with winget now?"
if errorlevel 2 exit /b 1
winget install --id Gyan.FFmpeg -e --source winget --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
   echo Installation failed. No app data was changed.
   pause
   exit /b 1
)
echo.
echo Close this window and run setup_windows.bat again to refresh PATH.
pause
exit /b 0

:check_ffprobe
where ffprobe >nul 2>nul
if %errorlevel%==0 goto ready
echo ffprobe was not found alongside ffmpeg. Install a full FFmpeg build.
pause
exit /b 1

:ready
echo.
echo Python and FFmpeg appear available.
echo The app does not modify the original video files.
echo Start start_windows.bat to open the editor.
echo.
pause

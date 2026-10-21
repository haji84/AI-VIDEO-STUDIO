@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 launcher.py
  goto :done
)
where python >nul 2>nul
if %errorlevel%==0 (
  python launcher.py
  goto :done
)
echo Python 3 was not found. Install Python 3 from https://www.python.org/downloads/windows/
:done
if errorlevel 1 pause

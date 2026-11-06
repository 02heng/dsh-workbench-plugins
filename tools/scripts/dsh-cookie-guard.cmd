@echo off
rem DSH cookie guard launcher. Double-click = interactive menu (menu text is
rem printed by Python in UTF-8, so this file stays pure ASCII on purpose).
setlocal
chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"
set "PY=D:\DevTools\Python312\python.exe"
set "GUARD=D:\dsh-workbench\scripts\dsh-cookie-guard.py"

if "%~1"=="" goto menu
"%PY%" "%GUARD%" %*
set RC=%ERRORLEVEL%
echo.
echo exit code: %RC%   ^(0=ok 2=db missing 3=DSH running/locked 4=backup failed 5=cleanup failed^)
pause
exit /b %RC%

:menu
"%PY%" "%GUARD%" menu
set RC=%ERRORLEVEL%
echo.
pause
exit /b %RC%

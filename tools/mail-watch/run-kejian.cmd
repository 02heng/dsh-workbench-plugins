@echo off
setlocal
rem run-kejian.cmd - collect mails, rebuild ONLY the kejian (AI class-break) xlsx.
rem ONLY_PROJECT holds the xlsx to rebuild. Same rules as the full lane: unread only,
rem multi-key dedupe, max 10 mails per run, max 10 min, exit when done.
set "EGO="
for /d %%D in ("C:\Program Files\Citro Labs\ego lite\Application\0.*") do set "EGO=%%D\ego-browser.exe"
if not exist "%EGO%" set "EGO=C:\Program Files\Citro Labs\ego lite\Application\0.6.2.7\ego-browser.exe"
set "NODE=D:\DevTools\nodejs\node.exe"
set "PY=C:\Users\HY\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
set "LOG=D:\dsh-workbench\mail\126\last-run-kejian.log"
set "ONLY_PROJECT=kejian"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"
if not exist "D:\dsh-workbench\mail\126" mkdir "D:\dsh-workbench\mail\126"

echo [%date% %time%] start >> "%LOG%"
"%EGO%" nodejs -e "await import('file:///D:/dsh-workbench/mail-watch/collect.mjs')" >> "%LOG%" 2>&1
"%NODE%" "D:\dsh-workbench\mail-watch\review3.mjs" >> "%LOG%" 2>&1
"%PY%" "D:\dsh-workbench\mail-watch\make_xlsx.py" >> "%LOG%" 2>&1
echo [%date% %time%] done >> "%LOG%"
exit /b 0

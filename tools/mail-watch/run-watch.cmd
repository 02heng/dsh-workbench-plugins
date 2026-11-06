@echo off
setlocal
rem run-watch.cmd �?一次性收�?+ 体检 + 出表，跑完即退出（不常驻、无循环�?rem 由计划任�?DSH-126-mail-watch �?run-hidden.vbs 静默调用，不弹窗
set "EGO="
for /d %%D in ("C:\Program Files\Citro Labs\ego lite\Application\0.*") do set "EGO=%%D\ego-browser.exe"
if not exist "%EGO%" set "EGO=C:\Program Files\Citro Labs\ego lite\Application\0.6.2.7\ego-browser.exe"
set "NODE=D:\DevTools\nodejs\node.exe"
set "PY=C:\Users\HY\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
set "LOG=D:\dsh-workbench\mail\126\last-review.log"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"
set "TAR=C:\Windows\System32\tar.exe"
if not exist "D:\dsh-workbench\mail\126" mkdir "D:\dsh-workbench\mail\126"

echo [%date% %time%] start >> "%LOG%"
"%EGO%" nodejs -e "await import('file:///D:/dsh-workbench/mail-watch/collect.mjs')" >> "%LOG%" 2>&1
"%NODE%" "D:\dsh-workbench\mail-watch\review3.mjs" >> "%LOG%" 2>&1
"%PY%" "D:\dsh-workbench\mail-watch\make_xlsx.py" >> "%LOG%" 2>&1
echo [%date% %time%] done >> "%LOG%"
exit /b 0

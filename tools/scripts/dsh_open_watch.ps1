# DSH 打开守望：检测到 DeepSeek Harness 启动后，弹一次待办到期提醒（Windows 通知）
# 登录时由计划任务 DSH-Due-Reminder 拉起；也可以手动运行。
# 规则：DSH 每次“从关闭到打开”提醒一次；20 分钟内不重复提醒；最长守候 20 小时后自动退出。
# 日志：D:\dsh-workbench\scripts\dsh_open_watch.log
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$toast = Join-Path $root 'due_toast.ps1'
$log = Join-Path $root 'dsh_open_watch.log'
$procName = 'DeepSeek Harness'
$lastToast = [datetime]::MinValue
$wasRunning = $false
$deadline = (Get-Date).AddHours(20)

function Write-Log($msg) {
    $line = ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg)
    Add-Content -Path $log -Value $line -Encoding UTF8
}

Write-Log 'watcher start'
while ((Get-Date) -lt $deadline) {
    $running = [bool](Get-Process -Name $procName -ErrorAction SilentlyContinue)
    if ($running -and -not $wasRunning) {
        Write-Log 'DSH opened'
        Start-Sleep -Seconds 20      # 等应用起好、界面能显示通知
        if ((Get-Date) - $lastToast -gt (New-TimeSpan -Minutes 20)) {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $toast -Quiet | Out-Null
            $lastToast = Get-Date
            Write-Log 'toast shown'
        }
    }
    if (-not $running -and $wasRunning) { Write-Log 'DSH closed' }
    $wasRunning = $running
    Start-Sleep -Seconds 15
}
Write-Log 'watcher exit'

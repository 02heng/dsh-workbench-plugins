# 待办到期提醒（Windows 通知）
# 读 C:\Users\<用户>\.dsh\memories\TODOS-*.md，把「截止日期已到 / 临近（默认提前 1 天）」且未完成的待办
# 用 Windows 通知（任务栏气泡 / 操作中心）弹出来。
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File due_toast.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File due_toast.ps1 -DaysAhead 3
#   powershell -NoProfile -ExecutionPolicy Bypass -File due_toast.ps1 -Demo   # 用假数据试通知
param(
    [int]$DaysAhead = 1,
    [int]$ShowSeconds = 25,
    [switch]$Demo,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$memDir = Join-Path $env:USERPROFILE '.dsh\memories'
$today = (Get-Date).Date
$limit = $today.AddDays($DaysAhead)
$items = @()

function Get-DueItems {
    param([string]$Dir, [datetime]$Limit)
    $list = @()
    if (-not (Test-Path $Dir)) { return $list }
    Get-ChildItem $Dir -Filter 'TODOS-*.md' -File -ErrorAction SilentlyContinue | ForEach-Object {
        $raw = Get-Content $_.FullName -Raw -Encoding UTF8
        if (-not $raw) { return }
        $track = $_.BaseName -replace '^TODOS-', ''
        foreach ($block in ($raw -split '§')) {
            if ($block -notmatch '\[due:\s*(\d{4}-\d{2}-\d{2})\]') { continue }
            $dueTxt = $matches[1]
            try { $due = [datetime]::ParseExact($dueTxt, 'yyyy-MM-dd', $null) } catch { continue }
            if ($block -match '\[status:\s*(\w+)\]') {
                if ($matches[1] -eq 'done' -or $matches[1] -eq 'cancelled') { continue }
            }
            if ($due -gt $Limit) { continue }
            $title = ''
            $body = @()
            foreach ($ln in ($block -split "`n")) {
                $t = $ln.Trim()
                if (-not $t) { continue }
                if ($t.StartsWith('[')) { continue }
                if ($t.StartsWith('待办条目格式说明')) { continue }
                if (-not $title) { $title = $t } else { $body += $t }
            }
            if ($title) {
                $list += [pscustomobject]@{ Track = $track; Due = $due; Title = $title; Detail = ($body -join ' ') }
            }
        }
    }
    return $list
}

if ($Demo) {
    $items = @([pscustomobject]@{ Track = 'work(demo)'; Due = $today.AddDays(1); Title = '这是一条测试提醒：报送材料明天到期'; Detail = '演示数据，可忽略。' })
} else {
    $items = Get-DueItems -Dir $memDir -Limit $limit
}

if (-not $items -or $items.Count -eq 0) {
    if (-not $Quiet) { Write-Output 'NO-DUE-ITEMS' }
    exit 0
}

$lines = @()
foreach ($it in ($items | Sort-Object Due)) {
    $mark = if ($it.Due -lt $today) { '已逾期' } elseif ($it.Due -eq $today) { '今天到期' } else { (('{0:MM-dd}' -f $it.Due) + ' 到期（提前提醒）') }
    $lines += ('· [{0}] {1} —— {2}' -f $it.Track, $it.Title, $mark)
}
$body = ($lines -join "`r`n")
$title = ('待办提醒（{0} 条）' -f $items.Count)

if (-not $Quiet) {
    Write-Output $title
    Write-Output $body
}

# 弹 Windows 通知：优先用任务栏气泡（NotifyIcon）
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $ni = New-Object System.Windows.Forms.NotifyIcon
    $ni.Icon = [System.Drawing.SystemIcons]::Information
    $ni.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $ni.BalloonTipTitle = $title
    $ni.BalloonTipText = $body
    $ni.Visible = $true
    $ni.ShowBalloonTip($ShowSeconds * 1000)
    Start-Sleep -Seconds $ShowSeconds
    $ni.Visible = $false
    $ni.Dispose()
} catch {
    # 兜底：传统弹窗（会自动消失）
    $ws = New-Object -ComObject WScript.Shell
    $null = $ws.Popup(($title + "`r`n`r`n" + $body), $ShowSeconds, '待办提醒', 64)
}

# watch15b.ps1 - bounded 126 mail watch: collect -> review -> xlsx, repeated
param(
  [int]$Minutes = 15,
  [int]$IntervalSec = 90
)
$ErrorActionPreference = 'Continue'
$root = 'D:\dsh-workbench\mail\126'
$log  = Join-Path $root 'watch15.log'
$EGO  = 'C:\Program Files\Citro Labs\ego lite\Application\0.6.2.5\ego-browser.exe'
$NODE = 'D:\DevTools\nodejs\node.exe'
$PY   = 'C:\Users\HY\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
Set-Location 'D:\dsh-workbench\mail-watch'

function Log([string]$t) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $t
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

$end = (Get-Date).AddMinutes($Minutes)
$n = 0
Log ("WATCH START {0} min interval {1}s" -f $Minutes, $IntervalSec)

while ((Get-Date) -lt $end) {
  $n++
  $t0 = Get-Date
  Log ("=== round {0} begin ===" -f $n)

  try {
    $out = & $EGO nodejs -e "await import('file:///D:/dsh-workbench/mail-watch/collect.mjs')" 2>&1 | Out-String
    Add-Content -LiteralPath $log -Value ("--- collect ---`n" + $out) -Encoding UTF8
  } catch { Log ("collect FAILED: " + $_.Exception.Message) }

  try {
    $out = & $NODE 'D:\dsh-workbench\mail-watch\review3.mjs' 2>&1 | Out-String
    Add-Content -LiteralPath $log -Value ("--- review3 ---`n" + $out) -Encoding UTF8
  } catch { Log ("review3 FAILED: " + $_.Exception.Message) }

  try {
    $out = & $PY 'D:\dsh-workbench\mail-watch\make_xlsx.py' 2>&1 | Out-String
    Add-Content -LiteralPath $log -Value ("--- make_xlsx ---`n" + $out) -Encoding UTF8
  } catch { Log ("make_xlsx FAILED: " + $_.Exception.Message) }

  Copy-Item -LiteralPath (Join-Path $root 'last-run.json') -Destination (Join-Path $root ("_round{0}.json" -f $n)) -Force -ErrorAction SilentlyContinue
  $lr = Get-Content -LiteralPath (Join-Path $root 'last-run.json') -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
  Log ("=== round {0} end ({1:n0}s) last-run={2} ===" -f $n, ((Get-Date)-$t0).TotalSeconds, ($lr -replace '\s+',' '))

  $left = [int]($end - (Get-Date)).TotalSeconds
  if ($left -le 0) { break }
  $sleep = [Math]::Min($IntervalSec, $left)
  if ($sleep -gt 0) { Start-Sleep -Seconds $sleep }
}

# final pass so the last collected mail is reviewed and tabulated
Log ("=== final review+table pass ===")
try { $out = & $NODE 'D:\dsh-workbench\mail-watch\review3.mjs' 2>&1 | Out-String; Add-Content -LiteralPath $log -Value $out -Encoding UTF8 } catch {}
try { $out = & $PY 'D:\dsh-workbench\mail-watch\make_xlsx.py' 2>&1 | Out-String; Add-Content -LiteralPath $log -Value $out -Encoding UTF8 } catch {}
Log ("WATCH END rounds={0}" -f $n)

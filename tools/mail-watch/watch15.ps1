# watch15.ps1 - collect 126 mail repeatedly for a bounded window, then leave final state
param(
  [int]$Minutes = 15,
  [int]$IntervalSec = 90
)
$ErrorActionPreference = 'Continue'
$root = 'D:\dsh-workbench\mail\126'
$log  = Join-Path $root 'watch15.log'
$cmd  = 'D:\dsh-workbench\mail-watch\run-watch.cmd'
$end  = (Get-Date).AddMinutes($Minutes)
$n = 0
Add-Content -Path $log -Value ("[{0}] WATCH START {1} min" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Minutes) -Encoding UTF8
while ((Get-Date) -lt $end) {
  $n++
  $t0 = Get-Date
  Add-Content -Path $log -Value ("[{0}] === round {1} begin ===" -f (Get-Date -Format 'HH:mm:ss'), $n) -Encoding UTF8
  & $cmd *>> $log
  Add-Content -Path $log -Value ("[{0}] === round {1} end ({2:n0}s) ===" -f (Get-Date -Format 'HH:mm:ss'), $n, ((Get-Date)-$t0).TotalSeconds) -Encoding UTF8
  Copy-Item -LiteralPath (Join-Path $root 'last-run.json') -Destination (Join-Path $root ("_round{0}.json" -f $n)) -Force -ErrorAction SilentlyContinue
  $left = [int]($end - (Get-Date)).TotalSeconds
  if ($left -le 0) { break }
  $sleep = [Math]::Min($IntervalSec, $left)
  if ($sleep -gt 0) { Start-Sleep -Seconds $sleep }
}
Add-Content -Path $log -Value ("[{0}] WATCH END rounds={1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $n) -Encoding UTF8

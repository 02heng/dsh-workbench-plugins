' dsh-cookie-guard-hidden.vbs
' Keep the cookie guard running in the background (no console window).
' It waits for DSH to fully exit, then prunes accumulated dsh-auth-* cookies.
' Log: D:\dsh-workbench\scripts\dsh-cookie-guard.log
Option Explicit
Dim fso, sh, base, py, guard, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
base = "D:\DevTools\Python312\"
If fso.FileExists(base & "pythonw.exe") Then
  py = base & "pythonw.exe"
Else
  py = base & "python.exe"
End If
guard = "D:\dsh-workbench\scripts\dsh-cookie-guard.py"
cmd = """" & py & """ """ & guard & """ auto"
' 0 = hidden window, False = do not wait
sh.Run cmd, 0, False

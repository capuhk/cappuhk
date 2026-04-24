Dim scriptDir
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' 0 = 창 완전히 숨김
WshShell.Run "cmd /c """ & scriptDir & "start_v2.bat""", 0, False

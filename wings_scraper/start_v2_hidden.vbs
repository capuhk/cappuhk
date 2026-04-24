Dim scriptDir
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

Dim pythonExe
pythonExe = scriptDir & "python\python.exe"

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' cmd 없이 python 직접 실행 — 0 = 창 완전히 숨김
WshShell.Run """" & pythonExe & """ """ & scriptDir & "scraper_v2.py""", 0, False

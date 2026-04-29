Dim scriptDir
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

Dim pythonExe
pythonExe = scriptDir & "python\pythonw.exe"

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' 작업 디렉토리를 스크래퍼 폴더로 설정
WshShell.CurrentDirectory = scriptDir

' Playwright 브라우저 경로 환경변수 설정
WshShell.Environment("Process")("PLAYWRIGHT_BROWSERS_PATH") = scriptDir & "browsers"

' python 직접 실행 — 0 = 창 완전히 숨김, False = 비동기(기다리지 않음)
WshShell.Run """" & pythonExe & """ """ & scriptDir & "scraper_v2.py""", 0, False

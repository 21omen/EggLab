@echo off
setlocal
if "%~1"=="" (
  echo Drag an image file onto egglab-edit.cmd, or run: egglab-edit.cmd photo.png
  pause
  exit /b 1
)
set /p PROMPT=Describe the edit: 
if "%PROMPT%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0egglab.ps1" -Prompt "%PROMPT%" -Image "%~1" -Out "%~dpn1-egglab.png" -Open
pause

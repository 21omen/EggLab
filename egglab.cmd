@echo off
rem EggLab launcher - forwards every argument to egglab.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0egglab.ps1" %*

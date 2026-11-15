@echo off
rem EggLab panel launcher - forwards every argument to egglab-panel.ps1
rem Usage: egglab-panel.cmd [-Dev] [-Wait]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0egglab-panel.ps1" %*

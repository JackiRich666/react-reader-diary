@echo off
cd /d "%~dp0"
start "Reader Diary API" cmd /k npm.cmd run start:server
start "Reader Diary Client" cmd /k npm.cmd run start:client

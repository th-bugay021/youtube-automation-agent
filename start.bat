@echo off
start cmd /k "cd C:\Users\emman\youtube-automation-agent\frontend && npm run dev"
start cmd /k "cd C:\Users\emman\youtube-automation-agent\backend && npm run start:dev"
echo Servers starting... Open http://localhost:3000
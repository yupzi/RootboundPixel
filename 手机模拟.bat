@echo off
chcp 65001 >nul
title 种树炼金吃果果 · 手机模拟
cd /d "%~dp0"
where node >nul 2>nul || (echo 需要先安装 Node.js：https://nodejs.org & pause & exit /b)
node tools\mobile_preview.mjs
if errorlevel 1 pause

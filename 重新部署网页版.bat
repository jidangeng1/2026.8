@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在重新构建并部署网页版...
call bash deploy.sh
pause

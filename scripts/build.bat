@echo off
REM Windows 一键构建生产版本
setlocal

echo === 构建后端 ===
cd server
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
cd ..

echo.
echo === 构建前端 ===
cd client
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
cd ..

echo.
echo === 完成 ===
echo 启动: pm2 start ecosystem.config.cjs
echo.
endlocal
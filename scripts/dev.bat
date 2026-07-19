@echo off
REM Windows 启动开发服务
echo 启动后端 (新窗口) ...
start "birdlog-server" cmd /k "cd server && npm run dev"

timeout /t 2 /nobreak >nul

echo 启动前端 ...
cd client
call npm run dev
cd ..
endlocal
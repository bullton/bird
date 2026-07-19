@echo off
REM Windows 重置密码
cd server
call npm run reset-password -- %*
cd ..
endlocal
@echo off
REM 初始化 Windows 开发环境

setlocal

echo === 1. 检查 Node.js ===
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 20+
  echo 下载地址: https://nodejs.org/
  exit /b 1
)
node -v

echo.
echo === 2. 安装后端依赖 ===
cd server
if not exist node_modules (
  call npm install
) else (
  echo [跳过] node_modules 已存在
)
cd ..

echo.
echo === 3. 安装前端依赖 ===
cd client
if not exist node_modules (
  call npm install
) else (
  echo [跳过] node_modules 已存在
)
cd ..

echo.
echo === 4. 准备环境变量 ===
if not exist .env (
  copy .env.example .env >nul
  echo [完成] 已生成 .env，请编辑填入 JWT_SECRET
) else (
  echo [跳过] .env 已存在
)

echo.
echo === 5. 初始化数据库 ===
cd server
call npm run db:migrate
cd ..

echo.
echo === 全部完成 ===
echo 开发模式：
echo   npm run dev:server   (后端，:3000)
echo   npm run dev:client   (前端，:5173)
echo.
endlocal
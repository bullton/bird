#!/usr/bin/env bash
# 初始化 Linux/macOS 开发或部署环境
set -e

echo "=== 1. 检查 Node.js ==="
if ! command -v node &> /dev/null; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js 20+"
  echo "建议: https://nodejs.org/ 或使用 nvm"
  exit 1
fi
node -v

echo
echo "=== 2. 安装 sharp 系统依赖 (Linux) ==="
if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "$ID" in
    ubuntu|debian)
      if command -v apt-get &> /dev/null; then
        echo "安装 libvips-dev (Ubuntu/Debian)..."
        sudo apt-get update
        sudo apt-get install -y libvips-dev
      fi
      ;;
    centos|rhel|rocky|almalinux|fedora)
      if command -v yum &> /dev/null; then
        echo "安装 vips-devel (CentOS/RHEL)..."
        sudo yum install -y vips-devel
      elif command -v dnf &> /dev/null; then
        sudo dnf install -y vips-devel
      fi
      ;;
    arch|manjaro)
      if command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm libvips
      fi
      ;;
  esac
fi

echo
echo "=== 3. 安装后端依赖 ==="
cd "$(dirname "$0")/.."
cd server
if [ ! -d node_modules ]; then
  npm install
else
  echo "[跳过] node_modules 已存在"
fi
cd ..

echo
echo "=== 4. 安装前端依赖 ==="
cd client
if [ ! -d node_modules ]; then
  npm install
else
  echo "[跳过] node_modules 已存在"
fi
cd ..

echo
echo "=== 5. 准备环境变量 ==="
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[完成] 已生成 .env，请编辑填入 JWT_SECRET"
else
  echo "[跳过] .env 已存在"
fi

echo
echo "=== 6. 初始化数据库 ==="
cd server
npm run db:migrate
cd ..

echo
echo "=== 全部完成 ==="
echo "开发模式："
echo "  npm run dev:server   # 后端 :3000"
echo "  npm run dev:client   # 前端 :5173"
echo
echo "生产模式："
echo "  npm run build"
echo "  pm2 start ecosystem.config.cjs"
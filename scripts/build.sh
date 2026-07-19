#!/usr/bin/env bash
# Linux/macOS 一键构建生产版本
set -e
cd "$(dirname "$0")/.."

echo "=== 构建后端 ==="
cd server && npm run build && cd ..

echo
echo "=== 构建前端 ==="
cd client && npm run build && cd ..

echo
echo "=== 完成 ==="
echo "启动: pm2 start ecosystem.config.cjs"
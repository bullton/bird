#!/usr/bin/env bash
# Linux/macOS 启动开发服务（两个后台进程）
set -e
cd "$(dirname "$0")/.."

mkdir -p logs

echo "启动后端..."
cd server && npm run dev > ../logs/server.log 2>&1 &
echo $! > ../logs/server.pid
cd ..

sleep 2

echo "启动前端..."
cd client && npm run dev > ../logs/client.log 2>&1 &
echo $! > ../logs/client.pid
cd ..

echo
echo "后端 PID: $(cat logs/server.pid) - 端口 3000"
echo "前端 PID: $(cat logs/client.pid) - 端口 5173"
echo
echo "查看日志: tail -f logs/server.log  或  tail -f logs/client.log"
echo "停止: kill \$(cat logs/server.pid) \$(cat logs/client.pid)"
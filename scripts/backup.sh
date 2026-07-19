#!/usr/bin/env bash
# 备份数据库与照片
set -e
cd "$(dirname "$0")/.."

ROOT=$(pwd)
BACKUP_DIR="$ROOT/backups/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 数据库
if [ -f data/birdlog.db ]; then
  echo "备份数据库..."
  cp data/birdlog.db "$BACKUP_DIR/birdlog.db"
fi

# 照片
if [ -d data/photos ]; then
  echo "备份照片..."
  tar -czf "$BACKUP_DIR/photos.tar.gz" -C data photos
fi

echo
echo "完成: $BACKUP_DIR"
du -sh "$BACKUP_DIR"

# 清理 30 天前的备份
find "$ROOT/backups" -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null || true
echo "已清理 30 天前的旧备份"
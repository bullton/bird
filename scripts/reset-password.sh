#!/usr/bin/env bash
# Linux/macOS 重置密码
set -e
cd "$(dirname "$0")/.."
cd server
npm run reset-password -- "$@"
cd ..
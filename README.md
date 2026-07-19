# 家庭鸟类记录系统 (BirdLog)

本地部署的鸟类照片记录系统：拍照上传 → 后台异步 AI 识别 → 物种归类 → 时间线图鉴浏览。

## 特性

- **多用户**：支持家庭多人共用（管理员 / 成员角色）
- **本地优先**：数据库、照片全部存本地，数据完全属于你
- **AI 自动识别**：调用 MiniMax 视觉模型（`MiniMax-M3`），异步后台处理
- **学术风格**：每个物种自动生成中文简介
- **人工修正**：识别错的可以手动修改
- **EXIF 完整保留**：照片元数据、GPS、时间完整保留
- **可迁移**：整个目录打包就能换机器

## 技术栈

- **后端**：Node.js 20 + Fastify + Drizzle ORM + better-sqlite3 + sharp + exifr
- **前端**：React 18 + Vite + TypeScript + Ant Design + TanStack Query
- **存储**：SQLite (WAL) + 本地文件目录
- **进程管理**：PM2

## 快速开始

### Windows 开发

```cmd
:: 1. 初始化（首次）
scripts\setup.bat

:: 2. 编辑 .env，至少修改 JWT_SECRET
notepad .env

:: 3. 启动开发（两个窗口）
scripts\dev.bat
:: 浏览器打开 http://localhost:5173
```

### Linux 部署

```bash
# 1. 上传项目到服务器，解压到 /opt/birdlog
cd /opt/birdlog

# 2. 安装 Node.js 20+
# 参考 https://nodejs.org/

# 3. 初始化
chmod +x scripts/*.sh
./scripts/setup.sh

# 4. 编辑 .env
nano .env
# 务必修改 JWT_SECRET 为随机长字符串

# 5. 构建
./scripts/build.sh

# 6. 安装 PM2 并启动
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 startup    # 设置开机自启
pm2 save

# 7. 浏览器访问 http://<server-ip>:3000
```

## 首次使用流程

1. 浏览器打开首页
2. 点击「注册」，第一个注册的账号自动成为**管理员**
3. 系统强制要求修改默认密码
4. 进入「系统设置 → AI 识别配置」填写：
   - **API Key**（MiniMax Coding Plan 的 Key）
   - Base URL（默认 `https://api.minimaxi.com`）
   - 模型名（默认 `MiniMax-M3`）
5. 开始上传照片

## 常用命令

```bash
# 启动 / 停止 / 重启
pm2 start ecosystem.config.cjs
pm2 stop birdlog
pm2 restart birdlog

# 查看日志
pm2 logs birdlog

# 重置密码（遗忘 admin 密码时）
./scripts/reset-password.sh admin newPassword123

# 备份数据（db + photos）
./scripts/backup.sh
```

## 目录结构

```
birdlog/
├── server/                 后端代码
│   ├── src/
│   │   ├── index.ts        Fastify 入口
│   │   ├── config.ts       配置
│   │   ├── db/             数据库 schema + 迁移
│   │   ├── routes/         API 路由
│   │   ├── services/
│   │   │   ├── ai-client.ts       MiniMax API 封装
│   │   │   ├── image-processor.ts 图片处理
│   │   │   ├── task-worker.ts     后台异步 worker
│   │   │   └── jobs/              单个任务处理函数
│   │   ├── middleware/     鉴权
│   │   └── utils/          密码、加密
│   └── scripts/            reset-password
├── client/                 前端代码
│   ├── src/
│   │   ├── pages/          页面（首页、上传、时间线、图库、物种、管理）
│   │   ├── components/     公共组件
│   │   ├── api/            API 客户端
│   │   ├── stores/         Zustand
│   │   └── types/          类型定义
│   └── dist/               build 产物
├── data/                   运行时数据（重要，定期备份！）
│   ├── birdlog.db          SQLite 数据库
│   └── photos/
│       ├── originals/      原图
│       ├── main/           长边 1920px
│       └── thumbs/         400px 缩略图
├── scripts/                一键脚本（setup / dev / build / reset-password / backup）
├── logs/                   PM2 日志
├── backups/                备份输出
├── ecosystem.config.cjs    PM2 配置
├── .env                    环境变量（不要提交到 git）
└── package.json            顶层便捷脚本
```

## 角色与权限

| 角色 | 说明 |
|---|---|
| **管理员** (admin) | 全部权限，含系统设置、用户管理、配置 AI Key |
| **成员** (member) | 上传、识别、查看/编辑所有记录 |
| **游客** | 未登录用户，可查看所有公开内容，不能上传/编辑 |

家庭场景：父母之一是 admin，其他成员是 member，访客无需账号直接看。

## 备份与迁移

**每日备份**（建议加入 cron）：

```bash
0 2 * * * /opt/birdlog/scripts/backup.sh
```

备份内容：`birdlog.db` + `photos.tar.gz`，保留最近 30 天。

**迁移到新机器**：

```bash
# 旧机器
cd /opt && tar czf birdlog.tar.gz --exclude=birdlog/node_modules --exclude=birdlog/logs birdlog

# 新机器
tar xzf birdlog.tar.gz -C /opt/
cd /opt/birdlog
./scripts/setup.sh    # 自动安装依赖、初始化 db
./scripts/build.sh
pm2 start ecosystem.config.cjs
```

## 常见问题

**Q: 上传后一直显示"识别中"？**
A: 检查 `logs/` 下的 PM2 日志，或在「时间线」右上角查看 status 徽标。如果长时间无变化，进入管理后台 → 系统设置 → 检查 AI Key 是否正确填写。

**Q: 识别失败的图片怎么办？**
A: 在时间线找到该图片（带红色"识别失败"徽标），点击右下角的重试按钮可重新加入队列。

**Q: 怎么导出所有数据？**
A: 执行 `scripts/backup.sh`，整个 data 目录被打包到 backups/ 下。

**Q: 注册开关怎么关闭？**
A: 管理后台 → 系统设置 → 站点设置 → `allow_registration` 改为 `0`。

**Q: 唯一的 admin 密码忘了？**
A: `npm run reset-password -- admin newPassword123`。

## 安全提示

- **务必修改 `.env` 中的 `JWT_SECRET`** 为随机长字符串（推荐 `openssl rand -hex 32`）
- AI API Key 在数据库中加密存储（AES-256-GCM，使用 JWT_SECRET 派生密钥）
- `.env` 文件请设置权限：`chmod 600 .env`
- 启用公网访问时，强烈建议配置 Nginx 反向代理 + HTTPS
- 服务只监听家庭内网时（默认 `0.0.0.0`），建议用防火墙限制外部访问

## 许可

仅供家庭自用。
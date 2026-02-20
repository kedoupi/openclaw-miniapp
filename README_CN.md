# OpenClaw Mini App

📱 用于监控和管理 [OpenClaw](https://github.com/openclaw/openclaw) 多 Agent 系统的 Telegram Mini App 仪表盘。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](Dockerfile)

## 截图

| 总览 | 会话 | 费用 |
|------|------|------|
| ![总览](docs/dashboard-desktop.png) | ![会话](docs/sessions.png) | ![费用](docs/costs.png) |

| 定时任务 | 系统 | 实时动态 |
|---------|------|---------|
| ![定时](docs/crons.png) | ![系统](docs/system.png) | ![动态](docs/live.png) |

| 配置 | 移动端 |
|------|--------|
| ![配置](docs/config.png) | <img src="docs/dashboard-mobile.png" width="300" /> |

## 功能

- **📊 实时总览** — 费用追踪、系统健康仪表盘、Agent 状态一览
- **💬 会话监控** — 支持 100+ 并发会话，实时消息预览
- **⏰ 定时任务** — 查看、开关、手动触发 Cron 任务
- **💰 费用分析** — 按模型、Agent、日期、会话多维度拆分，支持月度预算
- **⚡ 实时动态** — SSE 驱动的全 Agent 活动实时流
- **🖥️ 系统健康** — CPU、内存、磁盘监控，附 24 小时历史趋势图
- **🔧 配置编辑** — 在浏览器中编辑工作区文件（AGENTS.md、SOUL.md、MEMORY.md 等）
- **🤖 多 Agent** — 完整支持多 Agent 架构，按 Agent 拆分费用，拓扑图展示
- **🌗 深色模式** — 自动跟随系统/Telegram 主题
- **📱 响应式** — 移动端 Telegram Mini App + 桌面端侧边栏布局

## 快速开始

### Docker（推荐）

```bash
git clone https://github.com/kedoupi/openclaw-miniapp.git
cd openclaw-miniapp

# 创建环境变量文件
cat > .env << EOF
TELEGRAM_BOT_TOKEN=你的_bot_token
ALLOWED_TELEGRAM_IDS=你的_telegram_id
EOF

# 启动
docker compose up -d
```

访问 `http://localhost:8800`

### 手动部署

```bash
git clone https://github.com/kedoupi/openclaw-miniapp.git
cd openclaw-miniapp
npm install --legacy-peer-deps
npm run build
DASHBOARD_PORT=8800 node server.js
```

## 配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DASHBOARD_PORT` | 服务端口 | `8800` |
| `OPENCLAW_DIR` | OpenClaw 配置目录 | `~/.openclaw` |
| `WORKSPACE_DIR` | Agent 工作区路径 | `$OPENCLAW_DIR/agents/<id>/workspace` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token（Mini App 鉴权用） | — |
| `ALLOWED_TELEGRAM_IDS` | 允许的 Telegram 用户 ID（逗号分隔） | — |

### Docker Compose

```yaml
services:
  dashboard:
    build: .
    container_name: openclaw-dashboard
    ports:
      - "8800:8800"
    volumes:
      - ~/.openclaw:/openclaw:ro          # 只读访问 OpenClaw 数据
      - ~/.openclaw/agents:/openclaw/agents:rw  # 工作区文件可编辑
      - dashboard-data:/app/data          # Dashboard 持久化数据
    environment:
      - DASHBOARD_PORT=8800
      - OPENCLAW_DIR=/openclaw
      - WORKSPACE_DIR=/openclaw/agents/jianguo/workspace
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - ALLOWED_TELEGRAM_IDS=${ALLOWED_TELEGRAM_IDS}
    restart: unless-stopped

volumes:
  dashboard-data:
```

## 鉴权

两种访问模式：

| 访问方式 | 鉴权要求 |
|----------|---------|
| IP 地址 / localhost | ✅ 直接放行 |
| 域名（如通过 Cloudflare Tunnel） | 🔐 需要 Telegram Mini App 验证 |

### 配置 Telegram Mini App

1. 通过 [@BotFather](https://t.me/BotFather) 创建 Bot
2. 设置 Bot 的 Menu Button URL 为你的仪表盘域名
3. 在 `.env` 中添加 `TELEGRAM_BOT_TOKEN` 和 `ALLOWED_TELEGRAM_IDS`
4. 在 Telegram 中打开 Bot → 点击菜单按钮 → 仪表盘以 Mini App 形式加载

## 技术栈

- **后端**：Node.js，零运行时依赖
- **前端**：React 19 + Vite + TailwindCSS
- **鉴权**：Telegram WebApp `initData` HMAC 验证
- **部署**：Docker 多阶段构建（~50MB 镜像）

## 容器模式

Docker 运行时，部分依赖宿主机的功能会优雅降级：

| 功能 | 容器内行为 |
|------|-----------|
| 手动执行 Cron | 返回 503（容器内无 `openclaw` CLI） |
| 触发心跳 | 返回 503 |
| 服务状态 | 显示"容器模式" |
| 会话/费用/Cron 数据 | ✅ 通过 Volume 挂载正常工作 |
| 配置/文件编辑 | ✅ agents 目录以 rw 挂载 |

## 开发

```bash
npm install --legacy-peer-deps
npm run dev          # Vite 开发服务器（热重载）
node server.js       # API 服务器（另开终端）
```

## 致谢

- 基于 [OpenClaw](https://github.com/openclaw/openclaw) 生态
- 原始仪表盘概念来自 [tugcantopaloglu](https://github.com/tugcantopaloglu/openclaw-dashboard)

## License

[MIT](LICENSE)

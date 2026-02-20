# OpenClaw Monitor - Telegram Mini App

OpenClaw 系统的 Telegram Mini App 监控面板。

## 功能

- 📊 **总览**: 7 个 Agent 状态、今日费用、系统资源
- 💬 **会话**: Session 列表、Token 用量、消息预览
- ⏰ **定时任务**: Cron 任务列表、调度、执行状态
- 💰 **费用**: 今日/本周/本月统计、按模型/Agent 分解、趋势图
- ⚙️ **系统**: CPU/内存/磁盘、健康历史、服务状态

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建前端

```bash
npm run build
```

### 3. 配置环境变量

```bash
export TELEGRAM_BOT_TOKEN="你的 Bot Token"
export ALLOWED_TELEGRAM_IDS="6263008057"  # 允许的 Telegram 用户 ID
```

### 4. 启动服务

```bash
npm start
```

服务将在 http://localhost:7000 启动。

### 5. HTTPS 暴露（Telegram Mini App 必需）

**使用 Cloudflare Tunnel:**
```bash
cloudflared tunnel --url http://localhost:7000
```

**使用 Tailscale Funnel:**
```bash
tailscale funnel --bg 7000
```

### 6. 注册 Mini App

1. 找 @BotFather
2. `/newapp` 或 `/mybots` → 选择你的 bot → Mini App
3. 输入 HTTPS URL
4. 设置 Menu Button 或通过命令打开

## 开发

```bash
# 开发模式（前端热重载 + API 代理）
npm run dev

# 生产构建
npm run build
```

## 技术栈

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS + Recharts
- **后端**: Node.js (零依赖)
- **认证**: Telegram WebApp initData

## 项目结构

```
├── server.js          # 后端 API
├── src/               # 前端源码
│   ├── App.tsx
│   ├── pages/         # 5 个 Tab 页面
│   ├── components/    # 共享组件
│   ├── hooks/         # React hooks
│   ├── api/           # API 客户端
│   ├── types/         # TypeScript 类型
│   └── utils/         # 工具函数
├── dist/              # 构建输出
└── PRD.md             # 需求文档
```

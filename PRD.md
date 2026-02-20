# OpenClaw Monitor — Telegram Mini App

## 项目概述

将现有的 openclaw-dashboard（Web Dashboard）改造为 Telegram Mini App，让张老板在 Telegram 内随时查看 OpenClaw 系统状态。

**定位**：纯监控面板，不做操作控制（不重启、不改配置）。

---

## 技术架构

```
┌─────────────────────────────────────┐
│         Telegram Mini App           │
│  React + @telegram-apps/sdk-react  │
│  Tailwind CSS + shadcn/ui          │
└──────────────┬──────────────────────┘
               │ HTTPS (必须)
┌──────────────▼──────────────────────┐
│         Backend API (Node.js)       │
│  基于现有 server.js 数据采集层改造     │
│  认证：Telegram initData 验证        │
│  端口：7000                          │
└──────────────┬──────────────────────┘
               │ 读取本地文件
┌──────────────▼──────────────────────┐
│      OpenClaw 本地数据               │
│  ~/.openclaw/agents/*/sessions/     │
│  ~/.openclaw/cron/jobs.json         │
│  Agent workspace files              │
└─────────────────────────────────────┘
```

### 技术栈

- **前端**：React 19 + TypeScript + Vite + @telegram-apps/sdk-react + Tailwind CSS
- **后端**：Node.js（基于现有 server.js 改造，保留数据采集逻辑）
- **部署**：本地运行，通过 Cloudflare Tunnel 或 Tailscale Funnel 暴露 HTTPS

---

## 认证方案

### Telegram initData 验证（替换现有用户名/密码体系）

1. Mini App 启动时，Telegram 自动注入 `initData`
2. 后端用 Bot Token 验证 `initData` 的 HMAC 签名
3. 验证 `initData.user.id` 是否在允许列表中（只允许张老板的 Telegram ID: `6263008057`）
4. 验证通过后发放 JWT 或 session token，后续请求携带

**实现参考**：
- [Telegram Mini App 认证文档](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- 验证逻辑：`HMAC_SHA256(data_check_string, secret_key)` where `secret_key = HMAC_SHA256(bot_token, "WebAppData")`

**环境变量**：
```env
TELEGRAM_BOT_TOKEN=<建国 bot 的 token>
ALLOWED_TELEGRAM_IDS=6263008057
```

### 砍掉的认证功能
- ❌ 用户名/密码注册登录
- ❌ TOTP MFA
- ❌ 密码找回/Recovery Token
- ❌ Rate limiting（Telegram 已有身份验证）

---

## 功能模块（共 5 个 Tab）

### Tab 1: 总览 Dashboard

**顶部状态条**：
- Gateway 状态（🟢 运行中 / 🔴 离线）
- OpenClaw 版本号
- 系统运行时间 (uptime)

**Agent 卡片列表**（7 个 agent）：

| Agent | Emoji | 模型 | 定位 |
|-------|-------|------|------|
| 建国 | 🎯 | anthropic-proxy/claude-opus-4-6 | 全能助手+调度中心 |
| 靖雯 | 🌸 | anthropic-proxy/claude-sonnet-4-6 | 生活管家 |
| 翔超 | 💻 | openai-relay/gpt-5.3-codex | 全栈工程师 |
| 小微 | 📝 | anthropic-proxy/claude-sonnet-4-6 | 公众号写手 |
| 珂抖屁 | 🔍 | anthropic-proxy/claude-sonnet-4-6 | 技术雷达 |
| 老李 | 💰 | anthropic-proxy/claude-sonnet-4-6 | 投资搭档 |
| 卢山 | 🏔️ | moonshot/kimi-k2.5-code | 活动页面专家 |

每张卡片显示：
- Agent 名称 + emoji + 主模型（简写，如 `opus-4-6`）
- 最近活跃时间（如 "3 分钟前"）
- 今日 token 消耗（input/output）
- 今日费用 ($X.XX)
- 活跃 session 数

**系统资源**（底部小组件）：
- CPU 使用率 + 负载
- 内存使用（已用/总量 + 百分比）
- 磁盘使用百分比

**数据源**：
- Agent 列表：`openclaw config get agents.list` 或直接读 `openclaw.json`
- Session 数据：现有 `/api/sessions` 逻辑
- 系统数据：现有 `/api/system` 逻辑

---

### Tab 2: Sessions

**Session 列表**（按最近活跃排序）：

每条显示：
- Session 名称/标签
- 所属 Agent（emoji + 名称）
- 模型（简写）
- Token 用量进度条（contextTokens / 总容量）
- 最后活跃时间
- 费用
- 最后一条消息预览（截断 50 字）

**筛选**：
- 按 Agent 筛选（点 Agent emoji 快速筛选）
- 按状态筛选：活跃（1h 内）/ 全部
- 搜索关键词

**点击展开**：
- 显示最近 10-20 条消息摘要（role + 内容截断）
- Token 详情（input/output/cache）

**数据源**：
- 现有 `/api/sessions` + `/api/session-messages` 逻辑
- 需要改造：加入 agent 归属信息（从 session key 解析 agent ID）

---

### Tab 3: Cron 任务

**Cron 列表**（按下次执行时间排序）：

每条显示：
- 任务名称
- 所属 Agent（emoji + 名称）
- 使用模型（简写）
- 调度表达式（人类可读，如 "每天 18:00"）
- 状态：🟢 启用 / 🔴 禁用
- 上次执行：时间 + 状态（✅ ok / ❌ error）+ 耗时
- 下次执行：倒计时（如 "2h 30m 后"）

**当前所有 Cron 任务（供参考，数据从 API 动态获取）**：

| 任务名 | Agent | 模型 | 调度 |
|--------|-------|------|------|
| 持续学习扫描 | 珂抖屁 🔍 | kimi-k2.5-code | 9/13/17/21 点 |
| 代码日报 | 翔超 💻 | MiniMax-M2.5 | 每天 18:00 |
| 每日资讯 | 珂抖屁 🔍 | kimi-k2.5-code | 9:30/18:30 |
| 推特精选 | 珂抖屁 🔍 | kimi-k2.5-code | TBD |
| 工作日报 | 建国 🎯 | MiniMax-M2.5 | TBD |
| 每日晨报 | 建国 🎯 | MiniMax-M2.5 | TBD |
| 每日邮件整理 | 靖雯 🌸 | MiniMax-M2.5 | TBD |
| 技术雷达日扫 | 珂抖屁 🔍 | kimi-k2.5-code | TBD |
| 每日热点选题 | 小微 📝 | MiniMax-M2.5 | TBD |
| 每周学习简报 | 珂抖屁 🔍 | kimi-k2.5-code | TBD |
| 每周记忆清理 | 建国 🎯 | MiniMax-M2.5 | TBD |
| NVDA Q4财报分析 | 老李 💰 | claude-sonnet-4-6 | TBD |

**数据源**：
- 现有 `/api/crons` 逻辑
- 需要改造：加入 agentId 和 model 字段（现有代码没暴露这两个字段）

---

### Tab 4: 费用 Costs

**今日/本周/本月/累计**（4 个数字卡片）

**按模型分解**（饼图或条形图）：
- claude-opus-4-6: $X.XX
- claude-sonnet-4-6: $X.XX
- gpt-5.3-codex: $X.XX
- kimi-k2.5-code: $X.XX
- MiniMax-M2.5: $X.XX

**按 Agent 分解**（条形图）：
- 各 agent 今日/本周费用

**按天趋势**（折线图，最近 14 天）

**5 小时滚动窗口**：
- Opus output tokens / 限制
- Sonnet output tokens / 限制
- 当前 burn rate（tokens/min, $/min）

**数据源**：
- 现有 `/api/costs` + `/api/usage` + `/api/lifetime-stats` 逻辑
- 费用按 agent 分解需要新增（从 session key 解析 agent 归属）

---

### Tab 5: 系统 System

**系统监控**：
- CPU 使用率 + 温度（如果有）
- 内存：已用/总量 + 百分比 + 进度条
- 磁盘：已用/总量 + 百分比
- 负载：1m / 5m / 15m
- Uptime

**健康历史**（24h 趋势图）：
- CPU 使用率 sparkline
- 内存使用率 sparkline

**服务状态**：
- OpenClaw Gateway: 🟢/🔴
- ClaudeRelay Docker: 🟢/🔴
- Tailscale: 🟢/🔴 + IP

**版本信息**：
- OpenClaw 当前版本
- 最新可用版本（有更新时高亮）

**数据源**：
- 现有 `/api/system` + `/api/health-history` + `/api/services` + `/api/tailscale` 逻辑
- ClaudeRelay 状态需新增：`docker ps | grep claude-relay`

---

## 后端改造要点

### 1. 多 Agent 支持

现有代码硬编码 `OPENCLAW_AGENT` 单 agent。改为读取所有 agent：

```javascript
// 读取 openclaw.json 获取 agent 列表
const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const agents = config.agents?.list || [];

// 遍历所有 agent 的 sessions 目录
for (const agent of agents) {
  const agentSessDir = path.join(OPENCLAW_DIR, 'agents', agent.id, 'sessions');
  // ... 采集 session 数据
}
```

### 2. Cron API 增强

现有 `getCronJobs()` 只返回基础字段，需要加入：

```javascript
return {
  id: j.id,
  name: j.name,
  agentId: j.agentId,                          // ← 新增
  model: j.payload?.model || 'default',         // ← 新增
  schedule: humanSchedule,
  enabled: j.enabled !== false,
  lastStatus: j.state?.lastStatus || 'unknown',
  lastRunAt: j.state?.lastRunAtMs || 0,
  nextRunAt: j.state?.nextRunAtMs || 0,
  lastDuration: j.state?.lastDurationMs || 0,
  deliveryMode: j.delivery?.mode || 'announce', // ← 新增
};
```

### 3. 按 Agent 聚合费用

新增 API 端点 `/api/costs-by-agent`，从 session key 解析 agent 归属。

Session key 格式：`agent:<agentId>:main` 或 `agent:<agentId>:cron:<cronId>:<sessionId>` 等。

### 4. 认证层替换

- 删除所有 `/api/auth/*` 端点（register/login/logout/change-password/MFA 相关）
- 新增 `/api/auth/telegram` 端点：
  - 接收 Telegram initData
  - 验证 HMAC 签名
  - 检查 user.id 是否在允许列表
  - 返回 session token

### 5. 去掉操作类 API

删除以下端点（纯监控不需要）：
- `/api/action/restart-*`
- `/api/action/update-*`
- `/api/action/kill-*`
- `/api/action/sys-update`
- `/api/action/disk-cleanup`
- `/api/key-file` POST（文件编辑）
- `/api/cron/*/toggle`
- `/api/cron/*/run`

### 6. macOS 适配

现有代码已有 macOS 兼容（vm_stat、launchctl 等），保留。去掉 Linux 专属的 systemctl/apt/journalctl 逻辑。

### 7. ClaudeRelay 状态检测

新增：
```javascript
function getClaudeRelayStatus() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('docker ps --filter name=claude-relay --format "{{.Status}}" 2>/dev/null', 
      { encoding: 'utf8', timeout: 3000 }).trim();
    return { active: out.includes('Up'), status: out || 'Not running' };
  } catch { return { active: false, status: 'Docker not available' }; }
}
```

---

## 前端设计要求

### 风格
- 深色主题（Telegram 深色模式适配）
- 毛玻璃/glassmorphic 卡片风格（参考现有 dashboard 风格）
- 紧凑布局（手机竖屏优先）
- 使用 Telegram 主题颜色变量（`var(--tg-theme-bg-color)` 等）

### 交互
- 底部 Tab 导航（5 个 tab）
- 下拉刷新
- 列表项点击展开详情
- 数字动画过渡
- 骨架屏加载状态

### 图表
- 使用轻量图表库（如 Chart.js 或 Recharts），不要重型方案
- 费用趋势折线图
- 模型费用饼图
- 系统资源 sparkline

### 数据刷新
- 页面切换时获取最新数据
- 不需要实时 SSE（现有 `/api/live` 可以暂不接入）
- 可选：手动刷新按钮

---

## 部署方案

### 本地开发
```bash
cd ~/Coding/openclaw-dashboard
npm run dev          # Vite dev server (前端)
node server.js       # API server (后端)
```

### HTTPS 暴露（Telegram Mini App 强制要求 HTTPS）

**方案 A：Cloudflare Tunnel（推荐）**
```bash
# 安装 cloudflared
brew install cloudflared

# 创建隧道
cloudflared tunnel --url http://localhost:7000
```

**方案 B：Tailscale Funnel**
```bash
tailscale funnel --bg 7000
```

### 注册 Mini App
1. 找 @BotFather → `/newapp`
2. 选择建国的 bot
3. 输入 Mini App URL（HTTPS）
4. 设置 Menu Button 或通过命令打开

---

## 项目结构（建议）

```
~/Coding/openclaw-dashboard/
├── server.js              # 后端 API（改造现有文件）
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── index.html             # Vite 入口（替换现有 5238 行文件）
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/               # API 调用封装
│   │   └── client.ts
│   ├── components/
│   │   ├── Layout.tsx      # 底部 Tab 布局
│   │   ├── AgentCard.tsx
│   │   ├── SessionItem.tsx
│   │   ├── CronItem.tsx
│   │   ├── CostChart.tsx
│   │   └── SystemMetrics.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx   # Tab 1
│   │   ├── Sessions.tsx    # Tab 2
│   │   ├── Crons.tsx       # Tab 3
│   │   ├── Costs.tsx       # Tab 4
│   │   └── System.tsx      # Tab 5
│   ├── hooks/
│   │   ├── useAuth.ts      # Telegram 认证
│   │   └── useApi.ts       # 数据获取
│   ├── types/
│   │   └── index.ts        # TypeScript 类型定义
│   └── utils/
│       ├── telegram.ts     # Telegram SDK 封装
│       └── format.ts       # 格式化工具
└── docs/
    └── screenshots/
```

---

## Agent 信息映射表

前端需要硬编码或从 API 获取的 Agent 元数据：

```typescript
const AGENT_META: Record<string, { emoji: string; label: string; role: string }> = {
  jianguo:  { emoji: '🎯', label: '建国', role: '全能助手+调度中心' },
  jingwen:  { emoji: '🌸', label: '靖雯', role: '生活管家' },
  xiangchao:{ emoji: '💻', label: '翔超', role: '全栈工程师' },
  xiaowei:  { emoji: '📝', label: '小微', role: '公众号写手' },
  kedoupi:  { emoji: '🔍', label: '珂抖屁', role: '技术雷达' },
  laoli:    { emoji: '💰', label: '老李', role: '投资搭档' },
  lushan:   { emoji: '🏔️', label: '卢山', role: '活动页面专家' },
};
```

---

## MVP 优先级

### P0（必须有）
1. Telegram initData 认证
2. 总览 Dashboard（Agent 卡片 + 系统状态）
3. Cron 任务列表（带 agent + 模型信息）
4. 基础费用统计（今日/本周 + 按模型分解）

### P1（应该有）
5. Session 列表 + 筛选
6. 费用趋势图
7. 系统资源详情 + 历史趋势

### P2（锦上添花）
8. Session 消息预览
9. 5h 滚动窗口 burn rate
10. Tailscale 状态
11. 实时消息流（SSE）

---

## 参考资源

- [Telegram Mini Apps 官方文档](https://core.telegram.org/bots/webapps)
- [@telegram-apps/sdk-react](https://docs.telegram-mini-apps.com/)
- [现有 openclaw-dashboard](https://github.com/tugcantopaloglu/openclaw-dashboard)
- [AWS Telegram Mini App Sample](https://github.com/aws-samples/sample-telegram-miniapp)

---

## 注意事项

1. **HTTPS 是硬性要求** — Telegram Mini App 不接受 HTTP
2. **Bot Token 安全** — 只在后端使用，不暴露给前端
3. **性能** — Session 文件可能很大，后端需要缓存 + 分页
4. **移动端优先** — 90% 的使用场景在手机上
5. **保留现有 server.js 的数据采集逻辑** — 这块代码质量不错，不要重写

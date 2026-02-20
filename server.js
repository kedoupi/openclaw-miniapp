const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const crypto = require('crypto');

const IS_CONTAINER = fs.existsSync('/.dockerenv') || !!process.env.CONTAINER;
const PORT = parseInt(process.env.DASHBOARD_PORT || '7000');
const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(os.homedir(), '.openclaw');
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.OPENCLAW_WORKSPACE || process.cwd();
const cronFile = path.join(OPENCLAW_DIR, 'cron', 'jobs.json');
const dataDir = IS_CONTAINER ? '/app/data' : path.join(WORKSPACE_DIR, 'data');
const memoryDir = path.join(WORKSPACE_DIR, 'memory');
const memoryMdPath = path.join(WORKSPACE_DIR, 'MEMORY.md');
const heartbeatPath = path.join(WORKSPACE_DIR, 'HEARTBEAT.md');
const healthHistoryFile = path.join(dataDir, 'health-history.json');
const auditLogPath = path.join(dataDir, 'audit.log');

const skillsDir = path.join(WORKSPACE_DIR, 'skills');
const configFiles = [
  { name: 'openclaw-gateway.service', path: path.join(os.homedir(), '.config/systemd/user/openclaw-gateway.service') },
  { name: 'openclaw-config.json',     path: path.join(os.homedir(), '.openclaw/config.json') },
];
const workspaceFilenames = ['AGENTS.md','HEARTBEAT.md','IDENTITY.md','MEMORY.md','SOUL.md','TOOLS.md','USER.md'];
const claudeUsageFile = path.join(dataDir, 'claude-usage.json');
const geminiUsageFile = path.join(dataDir, 'gemini-usage.json');
const scrapeScript = path.join(WORKSPACE_DIR, 'scripts', 'scrape-claude-usage.sh');
const geminiScrapeScript = path.join(WORKSPACE_DIR, 'scripts', 'scrape-gemini-usage.sh');

const distDir = path.join(__dirname, 'dist');
const dashboardDataDir = IS_CONTAINER
  ? path.join(OPENCLAW_DIR, 'dashboard-data')
  : path.join(os.homedir(), '.openclaw', 'dashboard-data');
const budgetFile = path.join(dashboardDataDir, 'budget.json');
const cronHistoryFile = path.join(dashboardDataDir, 'cron-history.json');

try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
try { fs.mkdirSync(path.dirname(auditLogPath), { recursive: true }); } catch {}
try { fs.mkdirSync(dashboardDataDir, { recursive: true }); } catch {}

// --- Telegram Auth ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ALLOWED_TELEGRAM_IDS = new Set(
  (process.env.ALLOWED_TELEGRAM_IDS || '').split(',').filter(Boolean)
);

function verifyTelegramInitData(initData) {
  if (!TELEGRAM_BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computed !== hash) return null;
  try {
    const user = JSON.parse(params.get('user') || '{}');
    return user;
  } catch { return null; }
}

// --- Session Management ---
const sessions = new Map();
const SESSION_ACTIVITY_TIMEOUT = 30 * 60 * 1000;
const SESSION_REMEMBER_LIFETIME = 3 * 60 * 60 * 1000;

const READ_ONLY_FILES = new Set(['openclaw-gateway.service', 'openclaw-config.json']);

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(username, ip, rememberMe = false) {
  const token = generateSessionToken();
  const now = Date.now();
  const expiresAt = now + (rememberMe ? SESSION_REMEMBER_LIFETIME : SESSION_ACTIVITY_TIMEOUT);
  sessions.set(token, {
    username,
    ip,
    createdAt: now,
    lastActivity: now,
    expiresAt,
    rememberMe
  });
  return token;
}

function isAuthenticated(req) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const url = new URL(req.url, 'http://localhost');
    token = url.searchParams.get('token');
  }
  if (!token) return false;

  const session = sessions.get(token);
  if (!session) return false;

  const now = Date.now();
  if (now > session.expiresAt) {
    sessions.delete(token);
    return false;
  }

  if (!session.rememberMe) {
    if (now - session.lastActivity > SESSION_ACTIVITY_TIMEOUT) {
      sessions.delete(token);
      return false;
    }
    session.lastActivity = now;
  }

  return true;
}

function requireAuth(req, res) {
  if (!isAuthenticated(req)) {
    setSecurityHeaders(res);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
}

// --- Multi-Agent Support ---
function getAgentList() {
  try {
    const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.agents?.list || [];
  } catch { return []; }
}

function getAllSessionDirs() {
  const agents = getAgentList();
  const dirs = [];
  for (const agent of agents) {
    const dir = path.join(OPENCLAW_DIR, 'agents', agent.id, 'sessions');
    if (fs.existsSync(dir)) dirs.push({ agentId: agent.id, dir });
  }
  // Fallback to the original single agent if no config
  if (dirs.length === 0) {
    const fallbackId = process.env.OPENCLAW_AGENT || 'main';
    const dir = path.join(OPENCLAW_DIR, 'agents', fallbackId, 'sessions');
    if (fs.existsSync(dir)) dirs.push({ agentId: fallbackId, dir });
  }
  return dirs;
}

// --- Utility Functions ---
function auditLog(event, ip, details = {}) {
  try {
    const timestamp = new Date().toISOString();
    const entry = JSON.stringify({ timestamp, event, ip, ...details }) + '\n';
    fs.appendFileSync(auditLogPath, entry, 'utf8');
    const stats = fs.statSync(auditLogPath);
    if (stats.size > 10 * 1024 * 1024) {
      const lines = fs.readFileSync(auditLogPath, 'utf8').split('\n');
      const keep = lines.slice(-5000).join('\n');
      const tmpPath = auditLogPath + '.tmp';
      fs.writeFileSync(tmpPath, keep, 'utf8');
      fs.renameSync(tmpPath, auditLogPath);
    }
  } catch {}
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; frame-ancestors https://web.telegram.org; style-src 'self' 'unsafe-inline';");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function setSameSiteCORS(req, res) {
  const origin = req.headers.origin || req.headers.referer;
  const host = req.headers.host;
  if (origin && origin.includes(host)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    const proto = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    res.setHeader('Access-Control-Allow-Origin', `${proto}://${host}`);
  }
}

function getClientIP(req) {
  return req.socket.remoteAddress || 'unknown';
}

function isLocalhost(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function isTailscaleIP(ip) {
  const clean = ip.replace('::ffff:', '');
  return clean.startsWith('100.') && parseInt(clean.split('.')[1]) >= 64 && parseInt(clean.split('.')[1]) <= 127;
}

function isPrivateIP(ip) {
  const clean = ip.replace('::ffff:', '');
  // 10.0.0.0/8
  if (clean.startsWith('10.')) return true;
  // 192.168.0.0/16
  if (clean.startsWith('192.168.')) return true;
  // 172.16.0.0/12
  const parts = clean.split('.');
  if (parts.length === 4 && parts[0] === '172') {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function httpsEnforcement(req, res) {
  if (process.env.DASHBOARD_ALLOW_HTTP === 'true') return true;
  const ip = getClientIP(req);
  if (isLocalhost(ip)) return true;
  if (isPrivateIP(ip)) return true;  // 内网 IP 直接放行
  if (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') return true;
  setSecurityHeaders(res);
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('HTTPS required. Access via localhost, Tailscale, or enable HTTPS.');
  return false;
}

// --- Git Repos ---
function getGitRepos() {
  const repos = [];
  const projDir = path.join(WORKSPACE_DIR, 'projects');
  try {
    if (fs.existsSync(projDir)) {
      fs.readdirSync(projDir).forEach(d => {
        const full = path.join(projDir, d);
        if (fs.existsSync(path.join(full, '.git'))) repos.push({ path: full, name: d });
      });
    }
  } catch {}
  if (fs.existsSync(path.join(WORKSPACE_DIR, '.git'))) repos.push({ path: WORKSPACE_DIR, name: path.basename(WORKSPACE_DIR) });
  return repos;
}

// --- Session Data Helpers ---
function resolveName(key) {
  if (key.includes(':main:main')) return 'main';
  if (key.includes('teleg')) return 'telegram-group';
  if (key.includes('cron:')) {
    try {
      if (fs.existsSync(cronFile)) {
        const crons = JSON.parse(fs.readFileSync(cronFile, 'utf8'));
        const jobs = crons.jobs || [];
        const cronPart = key.split('cron:')[1] || '';
        const cronUuid = cronPart.split(':')[0];
        const job = jobs.find(j => j.id === cronUuid);
        if (job && job.name) return job.name;
      }
    } catch {}
    const cronPart = key.split('cron:')[1] || '';
    const cronUuid = cronPart.split(':')[0];
    return 'Cron: ' + cronUuid.substring(0, 8);
  }
  if (key.includes('subagent')) {
    const parts = key.split(':');
    return parts[parts.length - 1].substring(0, 12);
  }
  return key.split(':').pop().substring(0, 12);
}

function extractAgentIdFromKey(key) {
  // Parse keys like "agent:<agentId>:main" or "agent:<agentId>:cron:..."
  const match = key.match(/^agent:([^:]+):/);
  return match ? match[1] : '';
}

function getLastMessage(sessionId) {
  const agentDirs = getAllSessionDirs();
  for (const { dir } of agentDirs) {
    try {
      const filePath = path.join(dir, sessionId + '.jsonl');
      if (!fs.existsSync(filePath)) continue;
      const data = fs.readFileSync(filePath, 'utf8');
      const lines = data.split('\n').filter(l => l.trim());
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
        try {
          const d = JSON.parse(lines[i]);
          if (d.type !== 'message') continue;
          const msg = d.message;
          if (!msg) continue;
          const role = msg.role;
          if (role !== 'user' && role !== 'assistant') continue;
          let text = '';
          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            for (const b of msg.content) {
              if (b.type === 'text' && b.text) { text = b.text; break; }
            }
          }
          if (text) return text.replace(/\n/g, ' ').substring(0, 80);
        } catch {}
      }
      return '';
    } catch {}
  }
  return '';
}

function isSessionFile(f) { return f.endsWith('.jsonl') || f.includes('.jsonl.reset.'); }
function extractSessionId(f) { return f.replace(/\.jsonl(?:\.reset\.\d+)?$/, ''); }

let sessionCostCache = {};
let sessionCostCacheTime = 0;

function getSessionCost(sessionId) {
  const now = Date.now();
  if (now - sessionCostCacheTime > 60000) {
    sessionCostCache = {};
    sessionCostCacheTime = now;
    const agentDirs = getAllSessionDirs();
    for (const { dir } of agentDirs) {
      try {
        const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
        for (const file of files) {
          const sid = extractSessionId(file);
          let total = 0;
          const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const d = JSON.parse(line);
              if (d.type !== 'message') continue;
              const c = d.message?.usage?.cost?.total || 0;
              if (c > 0) total += c;
            } catch {}
          }
          if (total > 0) sessionCostCache[sid] = Math.round(total * 100) / 100;
        }
      } catch {}
    }
  }
  return sessionCostCache[sessionId] || 0;
}

function getSessionsJson() {
  const agentDirs = getAllSessionDirs();
  const allSessions = [];
  for (const { agentId, dir } of agentDirs) {
    try {
      const sFile = path.join(dir, 'sessions.json');
      const data = JSON.parse(fs.readFileSync(sFile, 'utf8'));
      for (const [key, s] of Object.entries(data)) {
        const keyAgentId = extractAgentIdFromKey(key) || agentId;
        allSessions.push({
          key,
          agentId: keyAgentId,
          label: s.label || resolveName(key),
          model: s.modelOverride || s.model || '-',
          totalTokens: s.totalTokens || 0,
          contextTokens: s.contextTokens || 0,
          kind: s.kind || (key.includes('group') ? 'group' : 'direct'),
          updatedAt: s.updatedAt || 0,
          createdAt: s.createdAt || s.updatedAt || 0,
          aborted: s.abortedLastRun || false,
          thinkingLevel: s.thinkingLevel || null,
          channel: s.channel || '-',
          sessionId: s.sessionId || '-',
          lastMessage: getLastMessage(s.sessionId || key),
          cost: getSessionCost(s.sessionId || key)
        });
      }
    } catch {}
  }
  return allSessions;
}

function getCostData() {
  try {
    const agentDirs = getAllSessionDirs();
    const perModel = {};
    const perDay = {};
    const perSession = {};
    let total = 0;

    for (const { dir } of agentDirs) {
      const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
      for (const file of files) {
        const sid = extractSessionId(file);
        let scost = 0;
        const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (d.type !== 'message') continue;
            const msg = d.message;
            if (!msg || !msg.usage || !msg.usage.cost) continue;
            const c = msg.usage.cost.total || 0;
            if (c <= 0) continue;
            const model = msg.model || 'unknown';
            if (model.includes('delivery-mirror')) continue;
            const ts = d.timestamp || '';
            const day = ts.substring(0, 10);
            perModel[model] = (perModel[model] || 0) + c;
            perDay[day] = (perDay[day] || 0) + c;
            scost += c;
            total += c;
          } catch {}
        }
        if (scost > 0) perSession[sid] = (perSession[sid] || 0) + scost;
      }
    }

    const now = new Date();
    const todayKey = now.toISOString().substring(0, 10);
    const weekAgo = new Date(now - 7 * 86400000).toISOString().substring(0, 10);
    const monthAgo = new Date(now - 30 * 86400000).toISOString().substring(0, 10);
    let weekCost = 0;
    let monthCost = 0;
    for (const [d, c] of Object.entries(perDay)) {
      if (d >= weekAgo) weekCost += c;
      if (d >= monthAgo) monthCost += c;
    }

    // Build session labels for the top sessions by cost
    const sidLabels = {};
    for (const { dir } of agentDirs) {
      try {
        const sData = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8'));
        for (const [key, val] of Object.entries(sData)) {
          if (val.sessionId) sidLabels[val.sessionId] = val.label || key.split(':').slice(2).join(':');
        }
      } catch {}
    }

    const perSessionLabeled = Object.fromEntries(
      Object.entries(perSession).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([sid, cost]) => {
        let label = sidLabels[sid] || null;
        if (!label) {
          // Search across all agent dirs for the session file
          for (const { dir } of agentDirs) {
            try {
              const jf = path.join(dir, sid + '.jsonl');
              if (!fs.existsSync(jf)) continue;
              const lines = fs.readFileSync(jf, 'utf8').split('\n');
              for (const l of lines) {
                if (!l.includes('"user"')) continue;
                try {
                  const d = JSON.parse(l);
                  const c = d.message?.content;
                  const txt = typeof c === 'string' ? c : Array.isArray(c) ? c.find(x => x.type === 'text')?.text || '' : '';
                  if (txt) {
                    let t = txt.replace(/\n/g, ' ').trim();
                    const bgMatch = t.match(/background task "([^"]+)"/i);
                    if (bgMatch) t = 'Sub: ' + bgMatch[1];
                    const cronMatch = t.match(/\[cron:([^\]]+)\]/);
                    if (cronMatch) {
                      let cronName = cronMatch[1].substring(0, 8);
                      try {
                        const cj = JSON.parse(fs.readFileSync(cronFile, 'utf8'));
                        const job = cj.jobs?.find(j => j.id?.startsWith(cronMatch[1].substring(0, 8)));
                        if (job?.name) cronName = job.name;
                      } catch {}
                      t = 'Cron: ' + cronName;
                    }
                    if (t.startsWith('System:')) t = t.substring(7).trim();
                    t = t.replace(/^\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/, '');
                    if (t.startsWith('You are running a boot')) t = 'Boot check';
                    if (t.match(/whatsapp/i)) t = 'WhatsApp session';
                    const subMatch2 = t.match(/background task "([^"]+)"/i);
                    if (!bgMatch && subMatch2) t = 'Sub: ' + subMatch2[1];
                    label = t.substring(0, 35); if (t.length > 35) label += '\u2026';
                    break;
                  }
                } catch {}
              }
              if (label) break;
            } catch {}
          }
        }
        return [sid, { cost, label: label || ('session-' + sid.substring(0, 8)) }];
      })
    );

    return {
      total: Math.round(total * 100) / 100,
      today: Math.round((perDay[todayKey] || 0) * 100) / 100,
      week: Math.round(weekCost * 100) / 100,
      month: Math.round(monthCost * 100) / 100,
      perModel,
      perDay: Object.fromEntries(Object.entries(perDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)),
      perSession: perSessionLabeled
    };
  } catch (e) { return { total: 0, today: 0, week: 0, month: 0, perModel: {}, perDay: {}, perSession: {} }; }
}

let costCache = null;
let costCacheTime = 0;

function getUsageWindows() {
  try {
    const now = Date.now();
    const fiveHoursMs = 5 * 3600000;
    const oneWeekMs = 7 * 86400000;
    const agentDirs = getAllSessionDirs();

    const perModel5h = {};
    const perModelWeek = {};
    const recentMessages = [];

    for (const { dir } of agentDirs) {
      const files = fs.readdirSync(dir).filter(f => {
        if (!f.endsWith('.jsonl')) return false;
        try { return fs.statSync(path.join(dir, f)).mtimeMs > now - oneWeekMs; } catch { return false; }
      });

      for (const file of files) {
        const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (d.type !== 'message') continue;
            const msg = d.message;
            if (!msg || !msg.usage) continue;
            const ts = d.timestamp ? new Date(d.timestamp).getTime() : 0;
            if (!ts) continue;
            const model = msg.model || 'unknown';
            const inTok = (msg.usage.input || 0) + (msg.usage.cacheRead || 0) + (msg.usage.cacheWrite || 0);
            const outTok = msg.usage.output || 0;
            const cost = msg.usage.cost ? msg.usage.cost.total || 0 : 0;

            if (now - ts < fiveHoursMs) {
              if (!perModel5h[model]) perModel5h[model] = { input: 0, output: 0, cost: 0, calls: 0 };
              perModel5h[model].input += inTok;
              perModel5h[model].output += outTok;
              perModel5h[model].cost += cost;
              perModel5h[model].calls++;
            }
            if (now - ts < oneWeekMs) {
              if (!perModelWeek[model]) perModelWeek[model] = { input: 0, output: 0, cost: 0, calls: 0 };
              perModelWeek[model].input += inTok;
              perModelWeek[model].output += outTok;
              perModelWeek[model].cost += cost;
              perModelWeek[model].calls++;
            }
            if (now - ts < fiveHoursMs) {
              recentMessages.push({ ts, model, input: inTok, output: outTok, cost });
            }
          } catch {}
        }
      }
    }

    recentMessages.sort((a, b) => b.ts - a.ts);

    const estimatedLimits = { opus: 88000, sonnet: 220000 };

    let windowStart = null;
    if (recentMessages.length > 0) {
      windowStart = recentMessages[recentMessages.length - 1].ts;
    }
    const windowResetIn = windowStart ? Math.max(0, (windowStart + fiveHoursMs) - now) : 0;

    const thirtyMinAgo = now - 30 * 60000;
    const recent30 = recentMessages.filter(m => m.ts >= thirtyMinAgo);
    let burnTokensPerMin = 0;
    let burnCostPerMin = 0;
    if (recent30.length > 0) {
      const totalOut30 = recent30.reduce((s, m) => s + m.output, 0);
      const totalCost30 = recent30.reduce((s, m) => s + m.cost, 0);
      const spanMs = Math.max(now - Math.min(...recent30.map(m => m.ts)), 60000);
      burnTokensPerMin = totalOut30 / (spanMs / 60000);
      burnCostPerMin = totalCost30 / (spanMs / 60000);
    }

    const opusKey = Object.keys(perModel5h).find(k => k.includes('opus')) || '';
    const opusOut = opusKey ? perModel5h[opusKey].output : 0;
    const sonnetKey = Object.keys(perModel5h).find(k => k.includes('sonnet')) || '';
    const sonnetOut = sonnetKey ? perModel5h[sonnetKey].output : 0;

    const opusRemaining = estimatedLimits.opus - opusOut;
    const timeToLimit = burnTokensPerMin > 0 ? (opusRemaining / burnTokensPerMin) * 60000 : null;

    const perModelCost5h = {};
    for (const [model, data] of Object.entries(perModel5h)) {
      const isOpus = model.includes('opus');
      const isSonnet = model.includes('sonnet');
      let inputPrice = 0, outputPrice = 0, cachePrice = 0;
      if (isOpus) { inputPrice = 15; outputPrice = 75; cachePrice = 1.875; }
      else if (isSonnet) { inputPrice = 3; outputPrice = 15; cachePrice = 0.375; }
      perModelCost5h[model] = {
        inputCost: (data.input || 0) / 1000000 * inputPrice,
        outputCost: (data.output || 0) / 1000000 * outputPrice,
        totalCost: data.cost || 0
      };
    }

    const totalCost5h = Object.values(perModel5h).reduce((s, m) => s + (m.cost || 0), 0);
    const totalCalls5h = Object.values(perModel5h).reduce((s, m) => s + (m.calls || 0), 0);
    const costLimit = 35.0;
    const messageLimit = 1000;

    return {
      fiveHour: {
        perModel: perModel5h,
        perModelCost: perModelCost5h,
        windowStart,
        windowResetIn,
        recentCalls: recentMessages.slice(0, 20).map(m => ({
          ...m,
          ago: Math.round((now - m.ts) / 60000) + 'm ago'
        }))
      },
      weekly: {
        perModel: perModelWeek
      },
      burnRate: { tokensPerMinute: Math.round(burnTokensPerMin * 100) / 100, costPerMinute: Math.round(burnCostPerMin * 10000) / 10000 },
      estimatedLimits,
      current: {
        opusOutput: opusOut,
        sonnetOutput: sonnetOut,
        totalCost: Math.round(totalCost5h * 100) / 100,
        totalCalls: totalCalls5h,
        opusPct: Math.round((opusOut / estimatedLimits.opus) * 100),
        sonnetPct: Math.round((sonnetOut / estimatedLimits.sonnet) * 100),
        costPct: Math.round((totalCost5h / costLimit) * 100),
        messagePct: Math.round((totalCalls5h / messageLimit) * 100),
        costLimit,
        messageLimit
      },
      predictions: { timeToLimit: timeToLimit ? Math.round(timeToLimit) : null, safe: !timeToLimit || timeToLimit > 3600000 }
    };
  } catch (e) {
    return { fiveHour: { perModel: {} }, weekly: { perModel: {} } };
  }
}

function getRateLimitEvents() {
  try {
    const agentDirs = getAllSessionDirs();
    const events = [];
    const now = Date.now();
    const fiveHoursMs = 5 * 3600000;

    for (const { dir } of agentDirs) {
      const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
      for (const file of files) {
        const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            const ts = d.timestamp ? new Date(d.timestamp).getTime() : 0;
            if (now - ts > fiveHoursMs) continue;
            if (d.type === 'error' || (d.message && d.message.stopReason === 'rate_limit')) {
              const text = JSON.stringify(d);
              if (text.includes('rate') || text.includes('overloaded') || text.includes('429') || text.includes('limit')) {
                events.push({ ts, type: 'rate_limit', detail: text.substring(0, 200) });
              }
            }
          } catch {}
        }
      }
    }
    return events;
  } catch { return []; }
}

let usageCache = null;
let usageCacheTime = 0;

function getMemoryStats() {
  const totalMem = os.totalmem();
  if (process.platform !== 'darwin') {
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return { total: totalMem, used: usedMem, free: freeMem, percent: Math.round((usedMem / totalMem) * 100) };
  }
  try {
    const { execSync } = require('child_process');
    const out = execSync('vm_stat', { encoding: 'utf8', timeout: 2000 });
    let pageSize = 4096;
    const pageSizeMatch = out.match(/page size of (\d+) bytes/);
    if (pageSizeMatch) pageSize = parseInt(pageSizeMatch[1], 10);
    const num = (name) => {
      const m = out.match(new RegExp(name + ':\\s*(\\d+)'));
      return m ? parseInt(m[1], 10) * pageSize : 0;
    };
    const free = num('Pages free');
    const active = num('Pages active');
    const inactive = num('Pages inactive');
    const wired = num('Pages wired');
    const compressed = num('Pages occupied by compressor');
    const usedMem = active + wired + (compressed || 0);
    const availMem = free + inactive;
    const usedDisplay = Math.min(usedMem, totalMem - free);
    const memPercent = totalMem > 0 ? Math.min(100, Math.round((usedDisplay / totalMem) * 100)) : 0;
    return {
      total: totalMem,
      used: usedDisplay,
      free: free,
      percent: memPercent
    };
  } catch (e) {
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return { total: totalMem, used: usedMem, free: freeMem, percent: Math.round((usedMem / totalMem) * 100) };
  }
}

function getSystemStats() {
  try {
    const mem = getMemoryStats();
    const totalMem = mem.total;
    const usedMem = mem.used;
    const freeMem = mem.free;
    const memPercent = mem.percent;

    let cpuTemp = null;
    if (process.platform === 'linux') {
      try {
        const tempRaw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim();
        cpuTemp = parseInt(tempRaw, 10) / 1000;
      } catch {}
    } else if (process.platform === 'darwin') {
      try {
        const { execSync } = require('child_process');
        const out = execSync('osx-cpu-temp 2>/dev/null || true', { encoding: 'utf8', timeout: 2000 }).trim();
        const match = out.match(/(\d+(?:\.\d+)?)/);
        if (match) cpuTemp = parseFloat(match[1]);
      } catch {}
    }

    const loadAvg = os.loadavg();
    const uptime = os.uptime();

    let cpuUsage = 0;
    try {
      const loadAvg1m = os.loadavg()[0];
      const numCpus = os.cpus().length;
      cpuUsage = Math.min(Math.round((loadAvg1m / numCpus) * 100), 100);
    } catch {
      cpuUsage = 0;
    }

    let diskPercent = 0, diskUsed = '', diskTotal = '';
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'darwin') {
        const df = execSync("df -g / | tail -1", { encoding: 'utf8' }).trim();
        const parts = df.split(/\s+/).filter(Boolean);
        if (parts.length >= 5) {
          const totalGB = parseInt(parts[1], 10) || 0;
          const usedGB = parseInt(parts[2], 10) || 0;
          const pctStr = parts[4].replace('%', '');
          diskPercent = parseInt(pctStr, 10) || 0;
          diskUsed = usedGB + 'G';
          diskTotal = totalGB + 'G';
        }
      } else {
        const df = execSync("df / --output=pcent,used,size -B1G | tail -1", { encoding: 'utf8' }).trim();
        const parts = df.split(/\s+/);
        diskPercent = parseInt(parts[0], 10) || 0;
        diskUsed = (parts[1] || '') + 'G';
        diskTotal = (parts[2] || '') + 'G';
      }
    } catch {}

    let crashCount = 0;
    let crashesToday = 0;
    if (process.platform === 'linux') {
      try {
        const { execSync } = require('child_process');
        const logs = execSync("journalctl -u openclaw --since '7 days ago' --no-pager -o short 2>/dev/null | grep -ci 'SIGABRT\\|SIGSEGV\\|exit code [1-9]\\|process crashed\\|fatal error' || echo 0", { encoding: 'utf8' }).trim();
        crashCount = parseInt(logs, 10) || 0;
      } catch {}
      try {
        const { execSync } = require('child_process');
        const logs = execSync("journalctl -u openclaw --since today --no-pager -o short 2>/dev/null | grep -ci 'SIGABRT\\|SIGSEGV\\|exit code [1-9]\\|process crashed\\|fatal error' || echo 0", { encoding: 'utf8' }).trim();
        crashesToday = parseInt(logs, 10) || 0;
      } catch {}
    }

    return {
      cpu: { usage: cpuUsage, temp: cpuTemp },
      disk: { percent: diskPercent, used: diskUsed, total: diskTotal },
      crashCount,
      crashesToday,
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: memPercent,
        totalGB: (totalMem / 1073741824).toFixed(1),
        usedGB: (usedMem / 1073741824).toFixed(1),
        freeGB: (freeMem / 1073741824).toFixed(1)
      },
      loadAvg: { '1m': loadAvg[0].toFixed(2), '5m': loadAvg[1].toFixed(2), '15m': loadAvg[2].toFixed(2) },
      uptime: uptime
    };
  } catch (e) {
    return { cpu: { usage: 0, temp: null }, memory: { total: 0, used: 0, free: 0, percent: 0 }, loadAvg: { '1m': 0, '5m': 0, '15m': 0 }, uptime: 0 };
  }
}

// --- Live Watcher (multi-agent) ---
let liveClients = [];
let _dirWatchers = {};
const _fileWatchers = {};
const _fileSizes = {};

function watchSessionFile(dir, file) {
  const filePath = path.join(dir, file);
  const watchKey = filePath;
  const sessionKey = file.replace('.jsonl', '');
  if (_fileWatchers[watchKey]) return;
  try {
    _fileSizes[watchKey] = fs.statSync(filePath).size;
  } catch { _fileSizes[watchKey] = 0; }

  try {
    _fileWatchers[watchKey] = fs.watch(filePath, (eventType) => {
      if (eventType !== 'change') return;
      try {
        const stats = fs.statSync(filePath);
        if (stats.size <= (_fileSizes[watchKey] || 0)) return;
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.allocUnsafe(stats.size - (_fileSizes[watchKey] || 0));
        fs.readSync(fd, buffer, 0, buffer.length, _fileSizes[watchKey] || 0);
        fs.closeSync(fd);
        _fileSizes[watchKey] = stats.size;
        buffer.toString('utf8').split('\n').filter(l => l.trim()).forEach(line => {
          try { const data = JSON.parse(line); data._sessionKey = sessionKey; broadcastLiveEvent(data); } catch {}
        });
      } catch {}
    });
  } catch {}
}

function startLiveWatcher() {
  const agentDirs = getAllSessionDirs();
  for (const { dir } of agentDirs) {
    if (_dirWatchers[dir]) continue;
    try {
      fs.readdirSync(dir).filter(f => isSessionFile(f)).forEach(f => watchSessionFile(dir, f));
      _dirWatchers[dir] = fs.watch(dir, (eventType, filename) => {
        if (filename && isSessionFile(filename) && !_fileWatchers[path.join(dir, filename)]) {
          try { if (fs.existsSync(path.join(dir, filename))) watchSessionFile(dir, filename); } catch {}
        }
      });
    } catch {}
  }
}

function stopLiveWatchers() {
  Object.keys(_dirWatchers).forEach(k => { try { _dirWatchers[k].close(); } catch {} });
  _dirWatchers = {};
  Object.keys(_fileWatchers).forEach(k => { try { _fileWatchers[k].close(); } catch {} delete _fileWatchers[k]; });
}

function broadcastLiveEvent(data) {
  if (liveClients.length === 0) return;

  const event = formatLiveEvent(data);
  if (!event) return;

  const message = `data: ${JSON.stringify(event)}\n\n`;
  liveClients.forEach(res => {
    try {
      res.write(message);
    } catch {}
  });
}

function formatLiveEvent(data) {
  const timestamp = data.timestamp || new Date().toISOString();
  const sessionKey = data._sessionKey || data.sessionId || 'unknown';

  const allSessions = getSessionsJson();
  const session = allSessions.find(s => s.sessionId === sessionKey || s.key.includes(sessionKey));
  const label = session ? session.label : sessionKey.substring(0, 8);

  if (data.type === 'message') {
    const msg = data.message;
    if (!msg) return null;

    const role = msg.role || 'unknown';
    let content = '';

    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          content = block.text.substring(0, 150);
          break;
        } else if (block.type === 'toolCall' || block.type === 'tool_use') {
          content = `tool: ${block.name || block.toolName || 'tool'}(${(JSON.stringify(block.arguments || block.input || {})).substring(0, 80)})`;
          break;
        } else if (block.type === 'toolResult' || block.type === 'tool_result') {
          const rc = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
          content = `Result: ${rc.substring(0, 100)}`;
          break;
        } else if (block.type === 'thinking') {
          content = `Thinking: ${(block.thinking || '').substring(0, 100)}`;
          break;
        }
      }
      if (!content && msg.content[0]) {
        content = JSON.stringify(msg.content[0]).substring(0, 100);
      }
    } else if (typeof msg.content === 'string') {
      content = msg.content.substring(0, 150);
    }

    if (!content && msg.type === 'tool_result') {
      const rc = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
      content = `Result: ${rc.substring(0, 100)}`;
    }

    if (!content) return null;

    return {
      timestamp,
      session: label,
      role,
      content: content.replace(/\n/g, ' ').trim()
    };
  }

  return null;
}

// --- Cron Jobs ---
function getCronJobs() {
  try {
    if (!fs.existsSync(cronFile)) return [];
    const data = JSON.parse(fs.readFileSync(cronFile, 'utf8'));
    return (data.jobs || []).map(j => {
      let humanSchedule = j.schedule?.expr || '';
      try {
        const parts = humanSchedule.split(' ');
        if (parts.length === 5) {
          const [min, hour, dom, mon, dow] = parts;
          const dowNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          let readable = '';
          if (dow !== '*') readable = dowNames[parseInt(dow)] || dow;
          if (hour !== '*' && min !== '*') readable += (readable ? ' ' : '') + `${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
          if (j.schedule?.tz) readable += ` (${j.schedule.tz.split('/').pop()})`;
          if (readable) humanSchedule = readable;
        }
      } catch {}
      return {
        id: j.id,
        name: j.name || j.id.substring(0, 8),
        agentId: j.agentId || '',
        model: j.payload?.model || 'default',
        schedule: humanSchedule,
        enabled: j.enabled !== false,
        lastStatus: j.state?.lastStatus || 'unknown',
        lastRunAt: j.state?.lastRunAtMs || 0,
        nextRunAt: j.state?.nextRunAtMs || 0,
        lastDuration: j.state?.lastDurationMs || 0,
        deliveryMode: j.delivery?.mode || 'announce',
      };
    });
  } catch { return []; }
}

// --- Git Activity ---
function getGitActivity() {
  try {
    const { execSync } = require('child_process');
    const repos = getGitRepos();
    const commits = [];
    for (const repo of repos) {
      try {
        if (!fs.existsSync(path.join(repo.path, '.git'))) continue;
        const log = execSync(`git -C ${repo.path} log --oneline --since='7 days ago' -10 --format='%H|%s|%at'`, { encoding: 'utf8', timeout: 5000 }).trim();
        if (!log) continue;
        log.split('\n').forEach(line => {
          const [hash, msg, ts] = line.split('|');
          commits.push({ repo: repo.name, hash: (hash || '').substring(0, 7), message: msg || '', timestamp: parseInt(ts || '0') * 1000 });
        });
      } catch {}
    }
    commits.sort((a, b) => b.timestamp - a.timestamp);
    return commits.slice(0, 15);
  } catch { return []; }
}

// --- Services Status (with ClaudeRelay) ---
function getClaudeRelayStatus() {
  if (IS_CONTAINER) return { active: null, status: 'Unavailable in container mode' };
  try {
    const { execSync } = require('child_process');
    const out = execSync('docker ps --filter name=claude-relay --format "{{.Status}}" 2>/dev/null',
      { encoding: 'utf8', timeout: 3000 }).trim();
    return { active: out.includes('Up'), status: out || 'Not running' };
  } catch { return { active: false, status: 'Docker not available' }; }
}

function getServicesStatus() {
  if (IS_CONTAINER) {
    const claudeRelay = getClaudeRelayStatus();
    return [
      { name: 'openclaw', active: null, status: 'Unavailable in container mode' },
      { name: 'agent-dashboard', active: true, status: 'Running (container)' },
      { name: 'claude-relay', active: claudeRelay.active, status: claudeRelay.status }
    ];
  }
  const { execSync } = require('child_process');
  const services = ['openclaw', 'agent-dashboard'];

  let result = [];

  if (os.platform() === 'linux') {
    result = services.map(name => {
      try {
        const status = execSync(`systemctl is-active ${name} 2>/dev/null`, { encoding: 'utf8', timeout: 3000 }).trim();
        return { name, active: status === 'active' };
      } catch { return { name, active: false }; }
    });
  } else if (os.platform() === 'darwin') {
    const gatewayUrl = process.env.GATEWAY_DASHBOARD_URL || 'http://localhost:18789';
    let agentDashboardActive = false;
    try {
      const code = execSync(`curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 --max-time 3 "${gatewayUrl}" 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }).trim();
      agentDashboardActive = code.length >= 1 && (code[0] === '2' || code[0] === '3');
    } catch { }

    let listOut = '';
    try {
      listOut = execSync('launchctl list 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
    } catch { listOut = ''; }
    const runningLabels = new Set();
    for (const line of listOut.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cols = trimmed.split(/\s+/);
      const pid = cols[0];
      const label = cols.length >= 3 ? cols[cols.length - 1] : '';
      if (pid !== '-' && pid !== '0' && label) runningLabels.add(label.toLowerCase());
    }
    const openclawActive = Array.from(runningLabels).some(label =>
      label === 'openclaw' || label.includes('openclaw')
    );

    result = services.map(name => {
      if (name === 'agent-dashboard') return { name, active: agentDashboardActive };
      return { name, active: openclawActive };
    });
  } else {
    result = services.map(name => ({ name, active: null }));
  }

  // Add ClaudeRelay Docker status
  const claudeRelay = getClaudeRelayStatus();
  result.push({ name: 'claude-relay', active: claudeRelay.active, status: claudeRelay.status });

  return result;
}

// --- Memory & Key Files ---
function getMemoryFiles() {
  const files = [];
  try {
    if (fs.existsSync(memoryMdPath)) {
      const stat = fs.statSync(memoryMdPath);
      files.push({ name: 'MEMORY.md', modified: stat.mtimeMs, size: stat.size });
    }
  } catch {}
  try {
    if (fs.existsSync(heartbeatPath)) {
      const stat = fs.statSync(heartbeatPath);
      files.push({ name: 'HEARTBEAT.md', modified: stat.mtimeMs, size: stat.size });
    }
  } catch {}
  try {
    if (fs.existsSync(memoryDir)) {
      const entries = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md')).sort().reverse();
      entries.forEach(e => {
        try {
          const stat = fs.statSync(path.join(memoryDir, e));
          files.push({ name: 'memory/' + e, modified: stat.mtimeMs, size: stat.size });
        } catch {}
      });
    }
  } catch {}
  return files;
}

function getKeyFiles() {
  const files = [];
  for (const fname of workspaceFilenames) {
    const fpath = path.join(WORKSPACE_DIR, fname);
    try {
      if (fs.existsSync(fpath)) {
        const stat = fs.statSync(fpath);
        files.push({ name: fname, modified: stat.mtimeMs, size: stat.size, editable: true });
      }
    } catch {}
  }
  try {
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir).sort();
      for (const e of entries) {
        const entryPath = path.join(skillsDir, e);
        try {
          const stat = fs.statSync(entryPath);
          if (stat.isDirectory()) {
            const skillMd = path.join(entryPath, 'SKILL.md');
            if (fs.existsSync(skillMd)) {
              const fstat = fs.statSync(skillMd);
              files.push({ name: 'skills/' + e + '/SKILL.md', modified: fstat.mtimeMs, size: fstat.size, editable: true });
            }
          } else if (e.endsWith('.md')) {
            files.push({ name: 'skills/' + e, modified: stat.mtimeMs, size: stat.size, editable: true });
          }
        } catch {}
      }
    }
  } catch {}
  for (const cf of configFiles) {
    try {
      if (fs.existsSync(cf.path)) {
        const stat = fs.statSync(cf.path);
        files.push({ name: cf.name, modified: stat.mtimeMs, size: stat.size, editable: !READ_ONLY_FILES.has(cf.name) });
      }
    } catch {}
  }
  return files;
}

function buildKeyFilesAllowed() {
  const map = {};
  for (const fname of workspaceFilenames) {
    const fpath = path.join(WORKSPACE_DIR, fname);
    if (fs.existsSync(fpath)) map[fname] = fpath;
  }
  try {
    if (fs.existsSync(skillsDir)) {
      for (const e of fs.readdirSync(skillsDir).sort()) {
        const ep = path.join(skillsDir, e);
        const stat = fs.statSync(ep);
        if (stat.isDirectory()) {
          const sm = path.join(ep, 'SKILL.md');
          if (fs.existsSync(sm)) map['skills/' + e + '/SKILL.md'] = sm;
        } else if (e.endsWith('.md')) {
          map['skills/' + e] = ep;
        }
      }
    }
  } catch {}
  for (const cf of configFiles) {
    if (fs.existsSync(cf.path)) map[cf.name] = cf.path;
  }
  return map;
}

// --- Token & Response Time (multi-agent) ---
function getTodayTokens() {
  try {
    const agentDirs = getAllSessionDirs();
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const perModel = {};
    let totalInput = 0, totalOutput = 0;

    for (const { dir } of agentDirs) {
      const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
      for (const file of files) {
        const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (d.type !== 'message') continue;
            const ts = d.timestamp || '';
            if (!ts.startsWith(todayStr)) continue;
            const msg = d.message;
            if (!msg || !msg.usage) continue;
            const model = (msg.model || 'unknown').split('/').pop();
            if (model === 'delivery-mirror') continue;
            const inTok = (msg.usage.input || 0) + (msg.usage.cacheRead || 0) + (msg.usage.cacheWrite || 0);
            const outTok = msg.usage.output || 0;
            if (!perModel[model]) perModel[model] = { input: 0, output: 0 };
            perModel[model].input += inTok;
            perModel[model].output += outTok;
            totalInput += inTok;
            totalOutput += outTok;
          } catch {}
        }
      }
    }
    return { totalInput, totalOutput, perModel };
  } catch { return { totalInput: 0, totalOutput: 0, perModel: {} }; }
}

function getAvgResponseTime() {
  try {
    const agentDirs = getAllSessionDirs();
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const diffs = [];

    for (const { dir } of agentDirs) {
      const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
      for (const file of files) {
        const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
        let lastUserTs = null;
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (d.type !== 'message') continue;
            const ts = d.timestamp || '';
            if (!ts.startsWith(todayStr)) continue;
            const role = d.message?.role;
            const msgTs = new Date(ts).getTime();
            if (role === 'user') {
              lastUserTs = msgTs;
            } else if (role === 'assistant' && lastUserTs) {
              const diff = msgTs - lastUserTs;
              if (diff > 0 && diff < 600000) diffs.push(diff);
              lastUserTs = null;
            }
          } catch {}
        }
      }
    }
    if (diffs.length === 0) return 0;
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length / 1000);
  } catch { return 0; }
}

// --- Costs by Agent ---
function getCostsByAgent() {
  try {
    const agentDirs = getAllSessionDirs();
    const now = new Date();
    const todayKey = now.toISOString().substring(0, 10);
    const weekAgo = new Date(now - 7 * 86400000).toISOString().substring(0, 10);
    const result = {};

    for (const { agentId, dir } of agentDirs) {
      let todayCost = 0, weekCost = 0, totalCost = 0;
      const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
      for (const file of files) {
        const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (d.type !== 'message') continue;
            const msg = d.message;
            if (!msg || !msg.usage || !msg.usage.cost) continue;
            const c = msg.usage.cost.total || 0;
            if (c <= 0) continue;
            const model = msg.model || 'unknown';
            if (model.includes('delivery-mirror')) continue;
            const ts = d.timestamp || '';
            const day = ts.substring(0, 10);
            totalCost += c;
            if (day === todayKey) todayCost += c;
            if (day >= weekAgo) weekCost += c;
          } catch {}
        }
      }
      result[agentId] = {
        today: Math.round(todayCost * 100) / 100,
        week: Math.round(weekCost * 100) / 100,
        total: Math.round(totalCost * 100) / 100,
      };
    }
    return result;
  } catch { return {}; }
}

// --- Disk & Health History ---
function trackDiskHistory(diskPercent) {
  const histFile = path.join(dataDir, 'disk-history.json');
  let history = [];
  try { history = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch {}
  const now = Date.now();
  if (history.length > 0 && now - history[history.length - 1].t < 1800000) return history;
  history.push({ t: now, v: diskPercent });
  if (history.length > 48) history = history.slice(-48);
  try { fs.writeFileSync(histFile, JSON.stringify(history)); } catch {}
  return history;
}

let healthHistory = [];
try {
  if (fs.existsSync(healthHistoryFile)) {
    healthHistory = JSON.parse(fs.readFileSync(healthHistoryFile, 'utf8'));
  }
} catch {}

function saveHealthSnapshot() {
  try {
    const stats = getSystemStats();
    const now = Date.now();
    healthHistory.push({
      t: now,
      cpu: stats.cpu?.usage || 0,
      ram: stats.memory?.percent || 0
    });
    if (healthHistory.length > 288) {
      healthHistory = healthHistory.slice(-288);
    }
    const dir = path.dirname(healthHistoryFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(healthHistoryFile, JSON.stringify(healthHistory));
  } catch (e) {
    console.error('Health snapshot error:', e);
  }
}

setInterval(saveHealthSnapshot, 5 * 60 * 1000);
saveHealthSnapshot();

// Cron history auto-tracking
let lastCronStates = {};
function trackCronHistory() {
  try {
    const crons = getCronJobs();
    for (const cr of crons) {
      const prevStatus = lastCronStates[cr.id];
      const currentStatus = cr.lastStatus;
      const currentRunAt = cr.lastRunAt;
      if (prevStatus && prevStatus.lastRunAt !== currentRunAt && currentRunAt > 0) {
        // Status changed - record to history
        let history = {};
        try { history = JSON.parse(fs.readFileSync(cronHistoryFile, 'utf8')); } catch {}
        if (!history[cr.id]) history[cr.id] = [];
        history[cr.id].unshift({
          timestamp: new Date(currentRunAt).toISOString(),
          status: currentStatus === 'ok' ? 'ok' : 'error',
          duration: cr.lastDuration,
          trigger: 'scheduled'
        });
        history[cr.id] = history[cr.id].slice(0, 50);
        try { fs.writeFileSync(cronHistoryFile, JSON.stringify(history, null, 2)); } catch {}
      }
      lastCronStates[cr.id] = { lastStatus: currentStatus, lastRunAt: currentRunAt };
    }
  } catch {}
}
setInterval(trackCronHistory, 60000);
trackCronHistory();

// Session cleanup
setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of sessions.entries()) {
    if (now > sess.expiresAt) {
      sessions.delete(token);
    } else if (!sess.rememberMe && now - sess.lastActivity > SESSION_ACTIVITY_TIMEOUT) {
      sessions.delete(token);
    }
  }
}, 60 * 1000);

// --- Static File Serving (Vite build output) ---
function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  // Remove query string
  filePath = filePath.split('?')[0];
  const fullPath = path.join(distDir, filePath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(distDir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(fullPath));
    } else {
      // SPA fallback
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(path.join(distDir, 'index.html'), 'utf8'));
    }
  } catch {
    res.writeHead(500); res.end('Error');
  }
}

// --- HTTP Server ---
const server = http.createServer((req, res) => {
  if (!httpsEnforcement(req, res)) return;
  setSecurityHeaders(res);
  // Prevent mobile Safari from serving stale dashboard/API responses.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const ip = getClientIP(req);

  if (req.method === 'OPTIONS') {
    setSameSiteCORS(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.writeHead(204);
    res.end();
    return;
  }

  // --- Auth Endpoints ---
  if (req.url === '/api/auth/status') {
    const loggedIn = isAuthenticated(req);
    setSameSiteCORS(req, res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ loggedIn }));
    return;
  }

  if (req.url === '/api/auth/telegram' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const { initData } = JSON.parse(body);
        if (!initData) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'initData required' }));
          return;
        }

        const user = verifyTelegramInitData(initData);
        if (!user) {
          auditLog('telegram_auth_failed', ip, { reason: 'invalid_initdata' });
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid Telegram initData' }));
          return;
        }

        const userId = String(user.id || '');
        if (ALLOWED_TELEGRAM_IDS.size > 0 && !ALLOWED_TELEGRAM_IDS.has(userId)) {
          auditLog('telegram_auth_denied', ip, { userId, username: user.username });
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User not authorized' }));
          return;
        }

        const username = user.username || user.first_name || `tg_${userId}`;
        const sessionToken = createSession(username, ip, true);
        auditLog('telegram_auth_success', ip, { userId, username });
        setSameSiteCORS(req, res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sessionToken, user: { id: userId, username } }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    });
    return;
  }

  // --- Protected API Endpoints ---
  if (req.url.startsWith('/api/')) {
    // Dev mode: skip auth when DASHBOARD_DEV=true and request is from localhost
    const devMode = process.env.DASHBOARD_DEV === 'true' && isLocalhost(ip);
    // IP direct access: skip auth for localhost and private IP connections
    const host = (req.headers.host || '').split(':')[0];
    const isIPAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost';
    if (!devMode && !isIPAddress && !requireAuth(req, res)) return;
    setSameSiteCORS(req, res);

    if (req.url === '/api/sessions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSessionsJson()));
      return;
    }
    if (req.url === '/api/usage') {
      const now = Date.now();
      if (!usageCache || now - usageCacheTime > 10000) {
        usageCache = getUsageWindows();
        usageCacheTime = now;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(usageCache));
      return;
    }
    if (req.url === '/api/costs') {
      const now = Date.now();
      if (!costCache || now - costCacheTime > 60000) {
        costCache = getCostData();
        costCacheTime = now;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(costCache));
      return;
    }
    if (req.url === '/api/costs-by-agent') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const costsByAgent = getCostsByAgent();
      // Convert object to array for frontend
      const result = Object.entries(costsByAgent).map(([agentId, data]) => ({
        agentId,
        ...data
      }));
      res.end(JSON.stringify(result));
      return;
    }
    if (req.url === '/api/system') {
      const stats = getSystemStats();
      if (stats.disk) stats.diskHistory = trackDiskHistory(stats.disk.percent || 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    }
    if (req.url.startsWith('/api/session-messages?')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const rawId = params.get('id') || '';
      const sessionId = rawId.replace(/[^a-zA-Z0-9\-_:.]/g, '');
      const messages = [];
      const agentDirs = getAllSessionDirs();
      try {
        for (const { dir } of agentDirs) {
          const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
          let targetFile = files.find(f => f.includes(sessionId));
          if (!targetFile) {
            const sFile = path.join(dir, 'sessions.json');
            try {
              const data = JSON.parse(fs.readFileSync(sFile, 'utf8'));
              for (const [k, v] of Object.entries(data)) {
                if (k === sessionId && v.sessionId) {
                  targetFile = files.find(f => f.includes(v.sessionId));
                  break;
                }
              }
            } catch {}
          }
          if (targetFile) {
            const lines = fs.readFileSync(path.join(dir, targetFile), 'utf8').split('\n').filter(l => l.trim());
            for (let i = Math.max(0, lines.length - 30); i < lines.length; i++) {
              try {
                const d = JSON.parse(lines[i]);
                if (d.type !== 'message') continue;
                const msg = d.message;
                if (!msg) continue;
                let text = '';
                if (typeof msg.content === 'string') text = msg.content;
                else if (Array.isArray(msg.content)) {
                  for (const b of msg.content) {
                    if (b.type === 'text' && b.text) { text = b.text; break; }
                    if (b.type === 'tool_use' || b.type === 'toolCall') { text = 'tool: ' + (b.name || b.toolName || 'tool'); break; }
                  }
                }
                if (text) messages.push({ role: msg.role || 'unknown', content: text.substring(0, 300), timestamp: d.timestamp || '' });
              } catch {}
            }
            break; // reason: found the session file, no need to search other agent dirs
          }
        }
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(messages));
      return;
    }
    if (req.url === '/api/crons') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getCronJobs()));
      return;
    }
    if (req.url === '/api/git') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getGitActivity()));
      return;
    }
    if (req.url === '/api/services') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getServicesStatus()));
      return;
    }
    if (req.url === '/api/memory') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getMemoryFiles()));
      return;
    }
    if (req.url === '/api/tokens-today') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getTodayTokens()));
      return;
    }
    if (req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'OpenClaw Dashboard', version: '1.0.0' }));
      return;
    }
    if (req.url === '/api/claude-usage-scrape' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (fs.existsSync(scrapeScript)) {
        exec(`bash ${scrapeScript}`, { timeout: 60000 }, (err) => {});
        res.end(JSON.stringify({ status: 'started' }));
      } else {
        res.end(JSON.stringify({ status: 'error', message: 'Scrape script not found' }));
      }
      return;
    }
    if (req.url === '/api/claude-usage') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      try {
        const data = JSON.parse(fs.readFileSync(claudeUsageFile, 'utf8'));
        res.end(JSON.stringify(data));
      } catch {
        res.end(JSON.stringify({ error: 'No usage data. Run scrape-claude-usage.sh first.' }));
      }
      return;
    }
    if (req.url === '/api/gemini-usage-scrape' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (fs.existsSync(geminiScrapeScript)) {
        exec(`bash ${geminiScrapeScript}`, { timeout: 60000 }, (err) => {});
        res.end(JSON.stringify({ status: 'started' }));
      } else {
        res.end(JSON.stringify({ status: 'error', message: 'Gemini scrape script not found' }));
      }
      return;
    }
    if (req.url === '/api/gemini-usage') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      try {
        const data = JSON.parse(fs.readFileSync(geminiUsageFile, 'utf8'));
        res.end(JSON.stringify(data));
      } catch {
        res.end(JSON.stringify({ error: 'No usage data. Run scrape-gemini-usage.sh first.' }));
      }
      return;
    }
    if (req.url === '/api/response-time') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ avgSeconds: getAvgResponseTime() }));
      return;
    }
    if (req.url.startsWith('/api/logs?')) {
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const allowedServices = ['openclaw', 'agent-dashboard', 'sshd', 'nginx'];
        const service = params.get('service') || 'openclaw';
        if (!allowedServices.includes(service)) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid service name');
          return;
        }
        if (process.platform !== 'linux') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Logs (journalctl) are only available on Linux.\nOn macOS use Console.app or: log show --predicate \'processImagePath contains "openclaw"\' --last 1h');
          return;
        }
        const lines = Math.min(Math.max(parseInt(params.get('lines')) || 100, 1), 1000);
        const { execSync } = require('child_process');
        const logs = execSync(`journalctl -u ${service} --no-pager -n ${lines} -o short 2>/dev/null || echo "No logs available"`, { encoding: 'utf8', timeout: 10000 });
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(logs);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error fetching logs');
      }
      return;
    }
    if (req.url === '/api/lifetime-stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      try {
        const now = Date.now();
        const cacheKey = 'lifetimeStats';
        const cacheTime = global[cacheKey + 'Time'] || 0;
        if (global[cacheKey] && now - cacheTime < 300000) {
          res.end(JSON.stringify(global[cacheKey]));
          return;
        }
        const agentDirs = getAllSessionDirs();
        let totalTokens = 0, totalMessages = 0, totalCost = 0, totalSessions = 0;
        let firstSessionDate = null;
        const activeDays = new Set();
        for (const { dir } of agentDirs) {
          const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
          totalSessions += files.length;
          for (const file of files) {
            const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const d = JSON.parse(line);
                if (d.type !== 'message') continue;
                totalMessages++;
                const msg = d.message;
                if (msg?.usage) {
                  const inTok = (msg.usage.input || 0) + (msg.usage.cacheRead || 0) + (msg.usage.cacheWrite || 0);
                  const outTok = msg.usage.output || 0;
                  totalTokens += inTok + outTok;
                  totalCost += msg.usage.cost?.total || 0;
                }
                if (d.timestamp) {
                  const ts = new Date(d.timestamp).getTime();
                  if (!firstSessionDate || ts < firstSessionDate) firstSessionDate = ts;
                  const day = d.timestamp.substring(0, 10);
                  activeDays.add(day);
                }
              } catch {}
            }
          }
        }
        const result = {
          totalTokens,
          totalMessages,
          totalCost: Math.round(totalCost * 100) / 100,
          totalSessions,
          firstSessionDate,
          daysActive: activeDays.size
        };
        global[cacheKey] = result;
        global[cacheKey + 'Time'] = now;
        res.end(JSON.stringify(result));
      } catch (e) {
        res.end(JSON.stringify({ totalTokens: 0, totalMessages: 0, totalCost: 0, totalSessions: 0, firstSessionDate: null, daysActive: 0 }));
      }
      return;
    }
    if (req.url === '/api/health-history') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthHistory));
      return;
    }
    if (req.url === '/api/memory-files') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getMemoryFiles()));
      return;
    }
    if (req.url.startsWith('/api/memory-file?')) {
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const fname = params.get('path') || '';
        let fpath = '';
        if (fname === 'MEMORY.md') fpath = memoryMdPath;
        else if (fname === 'HEARTBEAT.md') fpath = heartbeatPath;
        else if (fname.startsWith('memory/') && !fname.includes('..')) fpath = path.join(WORKSPACE_DIR, fname);
        else throw new Error('Invalid path');

        if (fs.existsSync(fpath)) {
          const content = fs.readFileSync(fpath, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(content);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad request');
      }
      return;
    }
    if (req.url === '/api/key-files') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getKeyFiles()));
      return;
    }
    if (req.url.startsWith('/api/key-file') && req.method === 'GET') {
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const name = params.get('path') || '';
        const allowed = buildKeyFilesAllowed();
        if (!allowed[name]) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
        const fpath = allowed[name];
        if (!fs.existsSync(fpath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
          return;
        }
        const content = fs.readFileSync(fpath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(content);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad request');
      }
      return;
    }
    if (req.url === '/api/live' || req.url.startsWith('/api/live?')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      liveClients.push(res);
      startLiveWatcher();

      res.write('data: {"status":"connected"}\n\n');

      try {
        const cutoff = Date.now() - 3600000;
        const agentDirs = getAllSessionDirs();
        const recentEvents = [];
        for (const { dir } of agentDirs) {
          const files = fs.readdirSync(dir).filter(f => {
            if (!f.endsWith('.jsonl')) return false;
            try { return fs.statSync(path.join(dir, f)).mtimeMs > cutoff; } catch { return false; }
          });
          files.forEach(file => {
            const sessionKey = file.replace('.jsonl', '');
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            lines.slice(-5).forEach(line => {
              try {
                const data = JSON.parse(line);
                data._sessionKey = sessionKey;
                const event = formatLiveEvent(data);
                if (event) recentEvents.push(event);
              } catch {}
            });
          });
        }
        recentEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        recentEvents.slice(0, 20).forEach(event => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        });
      } catch {}

      req.on('close', () => {
        liveClients = liveClients.filter(client => client !== res);
        if (liveClients.length === 0) {
          stopLiveWatchers();
        }
      });

      return;
    }

    // --- Cron Toggle API ---
    if (req.url === '/api/cron-toggle' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const { id, enabled } = JSON.parse(body);
          if (!id || typeof enabled !== 'boolean') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad request: need id and enabled' }));
            return;
          }
          const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          const crons = config.cron?.jobs || config.cron || [];
          const job = Array.isArray(crons) ? crons.find(j => j.id === id) : null;
          if (!job) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Cron job not found' }));
            return;
          }
          auditLog('cron_toggle', getClientIP(req), { id, enabled });
          job.enabled = enabled;
          const tmp = configPath + '.tmp.' + Date.now();
          fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
          fs.renameSync(tmp, configPath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, id, enabled }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // --- Memory Browser API ---
    if (req.url === '/api/agent-memory') {
      const agents = getAgentList();
      const result = {};
      for (const agent of agents) {
        const memDir = path.join(OPENCLAW_DIR, 'agents', agent.id, 'workspace', 'memory');
        const entries = [];
        try {
          if (fs.existsSync(memDir)) {
            for (const f of fs.readdirSync(memDir)) {
              if (!f.endsWith('.md')) continue;
              const fp = path.join(memDir, f);
              const stat = fs.statSync(fp);
              if (!stat.isFile()) continue;
              entries.push({ name: f, size: stat.size, modified: stat.mtimeMs });
            }
          }
        } catch {}
        entries.sort((a, b) => b.name.localeCompare(a.name));
        result[agent.id] = entries;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.url.startsWith('/api/agent-memory-file?') && req.method === 'GET') {
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const agentId = (params.get('agent') || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const fileName = (params.get('file') || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (!agentId || !fileName || !fileName.endsWith('.md')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad request' }));
          return;
        }
        const fpath = path.join(OPENCLAW_DIR, 'agents', agentId, 'workspace', 'memory', fileName);
        if (!fs.existsSync(fpath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(fs.readFileSync(fpath, 'utf8'));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // --- Agent Topology API ---
    if (req.url === '/api/topology') {
      const agents = getAgentList();
      const nodes = agents.map(a => ({
        id: a.id,
        label: a.label || a.id,
        model: typeof a.model === 'string' ? a.model : (a.model?.primary || ''),
        default: a.default || false,
      }));
      // Parse recent spawn relationships from session files
      const edges = [];
      const seen = new Set();
      for (const agent of agents) {
        const sessDir = path.join(OPENCLAW_DIR, 'agents', agent.id, 'sessions');
        try {
          if (!fs.existsSync(sessDir)) continue;
          const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl')).sort().reverse().slice(0, 20);
          for (const f of files) {
            try {
              const lines = fs.readFileSync(path.join(sessDir, f), 'utf8').split('\n').filter(Boolean).slice(-200);
              for (const line of lines) {
                try {
                  const msg = JSON.parse(line);
                  const content = typeof msg.content === 'string' ? msg.content : '';
                  // Detect sessions_spawn calls
                  const spawnMatch = content.match(/sessions_spawn.*?agentId['":\s]+(\w+)/);
                  if (spawnMatch) {
                    const target = spawnMatch[1];
                    const key = `${agent.id}->${target}`;
                    if (!seen.has(key) && agents.some(a => a.id === target)) {
                      edges.push({ from: agent.id, to: target, type: 'spawn' });
                      seen.add(key);
                    }
                  }
                } catch {}
              }
            } catch {}
          }
        } catch {}
      }
      // Default: jianguo as hub if no edges found
      if (edges.length === 0) {
        const hub = agents.find(a => a.default) || agents[0];
        if (hub) {
          for (const a of agents) {
            if (a.id !== hub.id) edges.push({ from: hub.id, to: a.id, type: 'dispatch' });
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ nodes, edges }));
      return;
    }

    // --- Skills API ---
    if (req.url === '/api/skills') {
      const globalSkillsDir = path.join(OPENCLAW_DIR, 'skills');
      const npmSkillsDir = path.join(os.homedir(), '.nvm/versions/node/v24.13.0/lib/node_modules/openclaw/skills');
      const globalSkills = [];
      
      // Read user-installed skills
      try {
        if (fs.existsSync(globalSkillsDir)) {
          for (const name of fs.readdirSync(globalSkillsDir)) {
            const skillPath = path.join(globalSkillsDir, name);
            if (!fs.statSync(skillPath).isDirectory()) continue;
            let description = '';
            try {
              const skillMd = fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf8');
              const descMatch = skillMd.match(/description:\s*["']?(.+?)["']?\s*\n/);
              if (descMatch) description = descMatch[1].trim();
            } catch {}
            globalSkills.push({ name, description, source: 'user' });
          }
        }
      } catch {}
      
      // Read built-in skills
      try {
        if (fs.existsSync(npmSkillsDir)) {
          for (const name of fs.readdirSync(npmSkillsDir)) {
            if (globalSkills.some(s => s.name === name)) continue;
            const skillPath = path.join(npmSkillsDir, name);
            if (!fs.statSync(skillPath).isDirectory()) continue;
            let description = '';
            try {
              const skillMd = fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf8');
              const descMatch = skillMd.match(/description:\s*["']?(.+?)["']?\s*\n/);
              if (descMatch) description = descMatch[1].trim();
            } catch {}
            globalSkills.push({ name, description, source: 'builtin' });
          }
        }
      } catch {}

      // Read per-agent skills
      const agents = getAgentList();
      const agentSkills = {};
      for (const agent of agents) {
        const agentSkillDir = path.join(OPENCLAW_DIR, 'agents', agent.id, 'workspace', 'skills');
        const skills = [];
        try {
          if (fs.existsSync(agentSkillDir)) {
            for (const name of fs.readdirSync(agentSkillDir)) {
              const sp = path.join(agentSkillDir, name);
              if (!fs.statSync(sp).isDirectory()) continue;
              let description = '';
              try {
                const skillMd = fs.readFileSync(path.join(sp, 'SKILL.md'), 'utf8');
                const descMatch = skillMd.match(/description:\s*["']?(.+?)["']?\s*\n/);
                if (descMatch) description = descMatch[1].trim();
              } catch {}
              skills.push({ name, description });
            }
          }
        } catch {}
        if (skills.length > 0) agentSkills[agent.id] = skills;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ global: globalSkills, perAgent: agentSkills }));
      return;
    }

    // --- Agent Workspace Files API ---
    if (req.url === '/api/agent-files') {
      const agents = getAgentList();
      const result = {};
      for (const agent of agents) {
        const wsDir = path.join(OPENCLAW_DIR, 'agents', agent.id, 'workspace');
        const files = [];
        try {
          for (const f of fs.readdirSync(wsDir)) {
            if (!f.endsWith('.md')) continue;
            const fp = path.join(wsDir, f);
            const stat = fs.statSync(fp);
            if (!stat.isFile()) continue;
            files.push({ name: f, size: stat.size, modified: stat.mtimeMs });
          }
        } catch {}
        result[agent.id] = files;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.url.startsWith('/api/agent-file?') && req.method === 'GET') {
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const agentId = (params.get('agent') || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const fileName = (params.get('file') || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (!agentId || !fileName || !fileName.endsWith('.md')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad request' }));
          return;
        }
        const fpath = path.join(OPENCLAW_DIR, 'agents', agentId, 'workspace', fileName);
        if (!fs.existsSync(fpath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(fs.readFileSync(fpath, 'utf8'));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.url === '/api/agent-file' && req.method === 'POST') {
      let body = '';
      let overflow = false;
      req.on('data', chunk => { body += chunk; if (body.length > 1048576) { overflow = true; req.destroy(); } });
      req.on('end', () => {
        if (overflow) { res.writeHead(413); res.end('Too large'); return; }
        try {
          const { agent, file, content } = JSON.parse(body);
          const agentId = (agent || '').replace(/[^a-zA-Z0-9_-]/g, '');
          const fileName = (file || '').replace(/[^a-zA-Z0-9._-]/g, '');
          if (!agentId || !fileName || !fileName.endsWith('.md') || typeof content !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad request' }));
            return;
          }
          const fpath = path.join(OPENCLAW_DIR, 'agents', agentId, 'workspace', fileName);
          auditLog('agent_file_edit', getClientIP(req), { agent: agentId, file: fileName });
          // Backup
          try { if (fs.existsSync(fpath)) fs.copyFileSync(fpath, fpath + '.bak'); } catch {}
          const tmp = fpath + '.tmp.' + Date.now();
          fs.writeFileSync(tmp, content, 'utf8');
          fs.renameSync(tmp, fpath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // --- Run Cron API (Feature 2) ---
    if (req.url === '/api/run-cron' && req.method === 'POST') {
      if (IS_CONTAINER) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not available in container mode' }));
        return;
      }
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const { id } = JSON.parse(body);
          if (!id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'id required' }));
            return;
          }
          auditLog('run_cron', getClientIP(req), { id });
          exec(`openclaw cron run --id "${id.replace(/[^a-zA-Z0-9\-]/g, '')}" 2>&1 || true`, { timeout: 30000 }, (err, stdout) => {
            // Record to cron history
            try {
              let history = {};
              try { history = JSON.parse(fs.readFileSync(cronHistoryFile, 'utf8')); } catch {}
              if (!history[id]) history[id] = [];
              history[id].unshift({
                timestamp: new Date().toISOString(),
                status: err ? 'error' : 'ok',
                trigger: 'manual',
                output: (stdout || '').substring(0, 200)
              });
              history[id] = history[id].slice(0, 50);
              fs.writeFileSync(cronHistoryFile, JSON.stringify(history, null, 2));
            } catch {}
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Cron job triggered' }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // --- Trigger Heartbeat API (Feature 2) ---
    if (req.url === '/api/trigger-heartbeat' && req.method === 'POST') {
      if (IS_CONTAINER) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not available in container mode' }));
        return;
      }
      auditLog('trigger_heartbeat', getClientIP(req));
      exec('openclaw system event --type heartbeat --message "Manual heartbeat from dashboard" 2>&1 || true', { timeout: 30000 }, (err, stdout) => {
        // ignore result, fire-and-forget
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Heartbeat triggered' }));
      return;
    }

    // --- Budget API (Feature 3) ---
    if (req.url === '/api/budget' && req.method === 'GET') {
      try {
        let budget = { monthly: 100, currency: 'USD' };
        try { budget = JSON.parse(fs.readFileSync(budgetFile, 'utf8')); } catch {}
        // Get current month cost
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const costData = getCostData();
        let monthCost = 0;
        for (const [day, cost] of Object.entries(costData.perDay)) {
          if (day.startsWith(monthStart)) monthCost += cost;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          monthly: budget.monthly,
          spent: Math.round(monthCost * 100) / 100,
          percent: budget.monthly > 0 ? Math.round((monthCost / budget.monthly) * 100) : 0
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.url === '/api/budget' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const { monthly } = JSON.parse(body);
          if (typeof monthly !== 'number' || monthly < 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid monthly budget' }));
            return;
          }
          auditLog('budget_set', getClientIP(req), { monthly });
          fs.writeFileSync(budgetFile, JSON.stringify({ monthly, updatedAt: Date.now() }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, monthly }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // --- Session Cleanup API (Feature 4) ---
    if (req.url === '/api/session-cleanup' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const { sessionKey } = JSON.parse(body);
          if (!sessionKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'sessionKey required' }));
            return;
          }
          auditLog('session_cleanup', getClientIP(req), { sessionKey });
          // Find and truncate the session transcript file
          const agentDirs = getAllSessionDirs();
          let cleaned = false;
          for (const { dir } of agentDirs) {
            try {
              const files = fs.readdirSync(dir).filter(f => isSessionFile(f));
              for (const file of files) {
                const sid = extractSessionId(file);
                if (sid === sessionKey || file.includes(sessionKey)) {
                  const fpath = path.join(dir, file);
                  const content = fs.readFileSync(fpath, 'utf8');
                  const lines = content.split('\n').filter(l => l.trim());
                  // Keep last 20% of lines (minimum 10)
                  const keepCount = Math.max(10, Math.floor(lines.length * 0.2));
                  const kept = lines.slice(-keepCount);
                  const backupPath = fpath + '.cleanup.' + Date.now();
                  fs.copyFileSync(fpath, backupPath);
                  fs.writeFileSync(fpath, kept.join('\n') + '\n');
                  cleaned = true;
                  break;
                }
              }
              if (cleaned) break;
            } catch {}
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: cleaned, message: cleaned ? 'Session transcript cleaned' : 'Session file not found' }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // --- Cron History API (Feature 7) ---
    if (req.url.startsWith('/api/cron-history')) {
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const id = params.get('id') || '';
        let history = {};
        try { history = JSON.parse(fs.readFileSync(cronHistoryFile, 'utf8')); } catch {}

        // Also try to get data from openclaw cron runs
        if (id) {
          const runs = history[id] || [];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(runs.slice(0, 10)));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(history));
        }
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // --- Serve static files from dist/ ---
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Dashboard: http://0.0.0.0:' + PORT);
});

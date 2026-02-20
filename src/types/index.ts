export interface AgentMeta {
  emoji: string;
  label: string;
  role: string;
}

// Agent metadata — dynamically populated from /api/topology on load.
// This object starts empty and gets filled by populateAgentMeta().
// If topology API is unavailable, agents will show with default 🤖 emoji and their ID as label.
export const AGENT_META: Record<string, AgentMeta> = {};

// Dynamically populated from /api/topology on first load
let _agentMetaLoaded = false;

export function getAgentMeta(id: string): AgentMeta {
  return AGENT_META[id] || { emoji: '🤖', label: id, role: '' };
}

export function populateAgentMeta(nodes: Array<{ id: string; label: string; model: string; default: boolean }>) {
  if (_agentMetaLoaded) return;
  const emojis = ['🎯', '💻', '🌸', '📝', '🔍', '💰', '🏔️', '🚀', '⚡', '🔧'];
  nodes.forEach((n, i) => {
    if (!AGENT_META[n.id]) {
      AGENT_META[n.id] = {
        emoji: emojis[i % emojis.length],
        label: n.label || n.id,
        role: n.default ? 'default' : '',
      };
    }
  });
  _agentMetaLoaded = true;
}

export interface Session {
  key: string;
  label: string;
  model: string;
  totalTokens: number;
  contextTokens: number;
  kind: string;
  updatedAt: number;
  createdAt: number;
  aborted: boolean;
  thinkingLevel: string | null;
  channel: string;
  sessionId: string;
  lastMessage: string;
  cost: number;
  agentId?: string;
}

export interface CronJob {
  id: string;
  name: string;
  agentId: string;
  model: string;
  schedule: string;
  enabled: boolean;
  lastStatus: string;
  lastRunAt: number;
  nextRunAt: number;
  lastDuration: number;
  deliveryMode: string;
}

export interface CostData {
  total: number;
  today: number;
  week: number;
  month: number;
  perModel: Record<string, number>;
  perDay: Record<string, number>;
  perSession: Record<string, { cost: number; label: string }>;
}

export interface CostByAgent {
  agentId: string;
  today: number;
  week: number;
  total: number;
}

export interface UsageData {
  fiveHour: {
    perModel: Record<string, { input: number; output: number; cost: number; calls: number }>;
    windowResetIn: number;
  };
  burnRate: { tokensPerMinute: number; costPerMinute: number };
  current: {
    opusOutput: number;
    sonnetOutput: number;
    totalCost: number;
    totalCalls: number;
    opusPct: number;
    sonnetPct: number;
    costPct: number;
    costLimit: number;
  };
}

export interface SystemStats {
  cpu: { usage: number; temp: number | null };
  memory: {
    total: number;
    used: number;
    free: number;
    percent: number;
    totalGB: string;
    usedGB: string;
    freeGB: string;
  };
  disk: { percent: number; used: string; total: string };
  loadAvg: { '1m': string; '5m': string; '15m': string };
  uptime: number;
}

export interface HealthPoint {
  t: number;
  cpu: number;
  ram: number;
}

export interface ServiceStatus {
  name: string;
  active: boolean | null;
}

export interface SessionMessage {
  role: string;
  content: string;
  timestamp: string;
}

export type TabId = 'dashboard' | 'sessions' | 'crons' | 'costs' | 'system' | 'config' | 'live';

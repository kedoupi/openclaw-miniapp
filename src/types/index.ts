export interface AgentMeta {
  emoji: string;
  label: string;
  role: string;
}

export const AGENT_META: Record<string, AgentMeta> = {
  jianguo:   { emoji: '🎯', label: '建国', role: '全能助手+调度中心' },
  jingwen:   { emoji: '🌸', label: '靖雯', role: '生活管家' },
  xiangchao: { emoji: '💻', label: '翔超', role: '全栈工程师' },
  xiaowei:   { emoji: '📝', label: '小微', role: '公众号写手' },
  kedoupi:   { emoji: '🔍', label: '珂抖屁', role: '技术雷达' },
  laoli:     { emoji: '💰', label: '老李', role: '投资搭档' },
  lushan:    { emoji: '🏔️', label: '卢山', role: '活动页面专家' },
};

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

const BASE_URL = '';

let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  authTelegram: (initData: string) =>
    request<{ sessionToken: string }>('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    }),

  getSessions: () =>
    request<Array<{
      key: string; label: string; model: string; totalTokens: number;
      contextTokens: number; kind: string; updatedAt: number; createdAt: number;
      aborted: boolean; thinkingLevel: string | null; channel: string;
      sessionId: string; lastMessage: string; cost: number; agentId?: string;
    }>>('/api/sessions'),

  getSessionMessages: (id: string) =>
    request<Array<{ role: string; content: string; timestamp: string }>>(
      `/api/session-messages?id=${encodeURIComponent(id)}`
    ),

  getCrons: () =>
    request<Array<{
      id: string; name: string; agentId: string; model: string;
      schedule: string; enabled: boolean; lastStatus: string;
      lastRunAt: number; nextRunAt: number; lastDuration: number; deliveryMode: string;
    }>>('/api/crons'),

  getCosts: () =>
    request<{
      total: number; today: number; week: number; month: number;
      perModel: Record<string, number>;
      perDay: Record<string, number>;
      perSession: Record<string, { cost: number; label: string }>;
    }>('/api/costs'),

  getCostsByAgent: () =>
    request<Array<{ agentId: string; today: number; week: number; total: number }>>(
      '/api/costs-by-agent'
    ),

  getUsage: () =>
    request<{
      fiveHour: {
        perModel: Record<string, { input: number; output: number; cost: number; calls: number }>;
        windowResetIn: number;
      };
      burnRate: { tokensPerMinute: number; costPerMinute: number };
      current: {
        opusOutput: number; sonnetOutput: number; totalCost: number;
        totalCalls: number; opusPct: number; sonnetPct: number;
        costPct: number; costLimit: number;
      };
    }>('/api/usage'),

  getSystem: () =>
    request<{
      cpu: { usage: number; temp: number | null };
      memory: { total: number; used: number; free: number; percent: number; totalGB: string; usedGB: string; freeGB: string };
      disk: { percent: number; used: string; total: string };
      loadAvg: { '1m': string; '5m': string; '15m': string };
      uptime: number;
    }>('/api/system'),

  getHealthHistory: () =>
    request<Array<{ t: number; cpu: number; ram: number }>>('/api/health-history'),

  getServices: () =>
    request<Array<{ name: string; active: boolean | null }>>('/api/services'),

  toggleCron: (id: string, enabled: boolean) =>
    request<{ success: boolean }>('/api/cron-toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    }),

  getAgentMemory: () =>
    request<Record<string, Array<{ name: string; size: number; modified: number }>>>('/api/agent-memory'),

  getAgentMemoryFile: (agent: string, file: string) =>
    fetch(`${BASE_URL}/api/agent-memory-file?agent=${encodeURIComponent(agent)}&file=${encodeURIComponent(file)}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),

  getTopology: () =>
    request<{ nodes: Array<{ id: string; label: string; model: string; default: boolean }>; edges: Array<{ from: string; to: string; type: string }> }>('/api/topology'),

  getSkills: () =>
    request<{ global: Array<{ name: string; description: string; source: string }>; perAgent: Record<string, Array<{ name: string; description: string }>> }>('/api/skills'),

  getAgentFiles: () =>
    request<Record<string, Array<{ name: string; size: number; modified: number }>>>('/api/agent-files'),

  getAgentFile: (agent: string, file: string) =>
    fetch(`${BASE_URL}/api/agent-file?agent=${encodeURIComponent(agent)}&file=${encodeURIComponent(file)}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),

  saveAgentFile: (agent: string, file: string, content: string) =>
    request<{ success: boolean }>('/api/agent-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, file, content }),
    }),

  getLifetimeStats: () =>
    request<{
      totalTokens: number; totalMessages: number; totalCost: number;
      totalSessions: number; firstSessionDate: number | null; daysActive: number;
    }>('/api/lifetime-stats'),

  getTokensToday: () =>
    request<{
      totalInput: number; totalOutput: number;
      perModel: Record<string, { input: number; output: number }>;
    }>('/api/tokens-today'),

  // Feature 2: Quick Actions
  runCron: (id: string) =>
    request<{ success: boolean; message: string }>('/api/run-cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }),

  triggerHeartbeat: () =>
    request<{ success: boolean; message: string }>('/api/trigger-heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),

  // Feature 3: Budget
  getBudget: () =>
    request<{ monthly: number; spent: number; percent: number }>('/api/budget'),

  setBudget: (monthly: number) =>
    request<{ success: boolean; monthly: number }>('/api/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly }),
    }),

  // Feature 4: Session Cleanup
  cleanupSession: (sessionKey: string) =>
    request<{ success: boolean; message: string }>('/api/session-cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionKey }),
    }),

  // Feature 7: Cron History
  getCronHistory: (id: string) =>
    request<Array<{ timestamp: string; status: string; duration?: number; trigger?: string; output?: string }>>(
      `/api/cron-history?id=${encodeURIComponent(id)}`
    ),
};

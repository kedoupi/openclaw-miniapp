export function timeAgo(ts: number): string {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  if (diff < 0) return '刚刚';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export function countdown(ts: number): string {
  if (!ts) return '-';
  const diff = ts - Date.now();
  if (diff <= 0) return '已过期';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m 后`;
  return `${minutes}m 后`;
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return String(tokens);
}

export function shortModel(model: string): string {
  if (!model || model === '-') return '-';
  const parts = model.split('/');
  const name = parts[parts.length - 1];
  return name
    .replace('anthropic-proxy/', '')
    .replace('openai-relay/', '')
    .replace('claude-', '')
    .replace('gpt-', 'gpt');
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function formatDuration(ms: number): string {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export function extractAgentId(sessionKey: string): string | null {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match ? match[1] : null;
}

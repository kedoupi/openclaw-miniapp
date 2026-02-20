import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { AGENT_META } from '../types';
import { formatCost, formatTokens, shortModel, timeAgo } from '../utils/format';

export function Dashboard() {
  const { data: sessions } = useApi(api.getSessions);
  const { data: costsByAgent } = useApi(api.getCostsByAgent);
  const { data: sys } = useApi(api.getSystem);
  const { data: costs } = useApi(api.getCosts);
  const { data: life } = useApi(api.getLifetimeStats);
  const { data: budget } = useApi(api.getBudget);
  const [hbStatus, setHbStatus] = useState<string | null>(null);

  const ac = useMemo(() => {
    const m: Record<string, number> = {};
    costsByAgent?.forEach(c => { m[c.agentId] = c.today; });
    return m;
  }, [costsByAgent]);

  const as = useMemo(() => {
    const m: Record<string, any[]> = {};
    sessions?.forEach(s => { const a = s.agentId || 'unknown'; (m[a] ||= []).push(s); });
    return m;
  }, [sessions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>OpenClaw</h1>
          {life && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{life.daysActive}天 · {life.totalSessions}会话</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dot dot-g" />
          <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>在线</span>
        </div>
      </div>

      {/* Hero Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="c" style={{ padding: '16px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>今日</div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'SF Mono, monospace', color: 'var(--text-1)', marginTop: 6, letterSpacing: '-0.03em' }}>{formatCost(costs?.today || 0)}</div>
        </div>
        <div className="c" style={{ padding: '16px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>本周</div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'SF Mono, monospace', color: 'var(--text-1)', marginTop: 6, letterSpacing: '-0.03em' }}>{formatCost(costs?.week || 0)}</div>
        </div>
      </div>

      {/* Budget Progress (Feature 3) */}
      {budget && budget.monthly > 0 && (
        <div className="c" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>月度预算</div>
            <div style={{ fontSize: 12, fontFamily: 'SF Mono, monospace', fontWeight: 600 }}>
              <span style={{ color: budget.percent > 100 ? 'var(--red)' : budget.percent > 80 ? 'var(--amber)' : 'var(--text-1)' }}>
                {formatCost(budget.spent)}
              </span>
              <span style={{ color: 'var(--text-3)' }}> / {formatCost(budget.monthly)}</span>
            </div>
          </div>
          <div className="bar-t" style={{ height: 6 }}>
            <div className="bar-f" style={{
              width: `${Math.min(budget.percent, 100)}%`,
              background: budget.percent > 100 ? 'var(--red)' : budget.percent > 80 ? 'var(--amber)' : 'var(--green)',
            }} />
          </div>
          <div style={{ fontSize: 10, color: budget.percent > 100 ? 'var(--red)' : budget.percent > 80 ? 'var(--amber)' : 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>
            {budget.percent}%
          </div>
        </div>
      )}

      {/* Quick Actions (Feature 2) */}
      <div className="c" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>快捷指令</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={async () => {
              setHbStatus('⏳');
              try {
                await api.triggerHeartbeat();
                setHbStatus('✅');
                setTimeout(() => setHbStatus(null), 2000);
              } catch { setHbStatus('❌'); setTimeout(() => setHbStatus(null), 2000); }
            }}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'rgba(0,122,255,0.08)', color: 'var(--blue)', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            {hbStatus || '💓'} 心跳检查
          </button>
        </div>
      </div>

      {/* System gauges */}
      {sys && (
        <div className="c" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>系统</div>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <Gauge label="CPU" val={sys.cpu?.usage ?? 0} />
            <Gauge label="内存" val={sys.memory?.percent ?? 0} sub={`${sys.memory?.usedGB}G`} />
            <Gauge label="磁盘" val={sys.disk?.percent ?? 0} />
          </div>
        </div>
      )}

      {/* Agents */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>AGENTS</div>
        <div className="desktop-grid" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(AGENT_META).map(([id, meta]) => {
            const ss = as[id] || [];
            const live = ss.filter(s => Date.now() - s.updatedAt < 3600000).length;
            const last = [...ss].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            const cost = ac[id] || 0;
            const tok = ss.reduce((s, x) => s + (x.totalTokens || 0), 0);

            return (
              <div key={id} className="c" style={{ padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="av">{meta.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{meta.label}</span>
                    <span style={{ fontFamily: 'SF Mono, monospace', fontSize: 13, fontWeight: 700, color: cost > 1 ? 'var(--text-1)' : 'var(--text-3)' }}>{formatCost(cost)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: 'var(--card-alt)', color: 'var(--text-2)', fontSize: 10 }}>{shortModel(last?.model || '-')}</span>
                    {live > 0 && <span className="badge" style={{ background: 'rgba(52,199,89,0.1)', color: 'var(--green)', fontSize: 10 }}>{live} 活跃</span>}
                    <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'SF Mono, monospace' }}>{formatTokens(tok)}</span>
                  </div>
                  {last && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {timeAgo(last.updatedAt)} · {last.lastMessage?.substring(0, 36) || meta.role}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Gauge({ label, val, sub }: { label: string; val: number; sub?: string }) {
  const r = 26, c = 2 * Math.PI * r, o = c - (val / 100) * c;
  const color = val > 85 ? 'var(--red)' : val > 60 ? 'var(--amber)' : 'var(--blue)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 60, height: 60 }}>
        <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="30" cy="30" r={r} fill="none" stroke="var(--gauge-track)" strokeWidth="3.5" />
          <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={o} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'SF Mono, monospace', color }}>{Math.round(val)}</span>
          {sub && <span style={{ fontSize: 8, color: 'var(--text-3)' }}>{sub}</span>}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

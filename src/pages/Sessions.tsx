import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { AGENT_META } from '../types';
import { formatTokens, shortModel, timeAgo, extractAgentId } from '../utils/format';

export function Sessions() {
  const { data: sessions, loading, refresh } = useApi(api.getSessions);
  const [fa, setFa] = useState<string | null>(null);
  const [exp, setExp] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState<string | null>(null);

  const list = useMemo(() => {
    if (!sessions) return [];
    return sessions
      .map(s => ({ ...s, agentId: s.agentId || extractAgentId(s.key) || '?' }))
      .filter(s => !fa || s.agentId === fa)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions, fa]);

  if (loading) return <div style={{ padding: 16 }}>{[1,2,3,4].map(i => <div key={i} className="sh" style={{ height: 68, marginBottom: 8 }} />)}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>会话</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{list.length} 个</p>
        </div>
        <button onClick={refresh} className="c" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, color: 'var(--blue)', cursor: 'pointer' }}>刷新</button>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <Pill on={!fa} onClick={() => setFa(null)}>全部</Pill>
        {Object.entries(AGENT_META).map(([id, m]) => <Pill key={id} on={fa === id} onClick={() => setFa(fa === id ? null : id)}>{m.emoji} {m.label}</Pill>)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.slice(0, 40).map(s => {
          const m = AGENT_META[s.agentId];
          const open = exp === s.key;
          const pct = Math.min((s.contextTokens / 200000) * 100, 100);
          const hot = Date.now() - s.updatedAt < 300000;
          return (
            <div key={s.key} className="c" style={{ overflow: 'hidden' }}>
              <button onClick={() => setExp(open ? null : s.key)} style={{ width: '100%', padding: '12px 14px', textAlign: 'left', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="av" style={{ width: 30, height: 30, borderRadius: 8, fontSize: 14 }}>{m?.emoji || '❓'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '58%' }}>{s.label || s.sessionId}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {hot && <span className="dot dot-g" style={{ width: 5, height: 5 }} />}
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{timeAgo(s.updatedAt)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span className="badge" style={{ background: 'var(--card-alt)', color: 'var(--text-2)', fontSize: 10 }}>{shortModel(s.model)}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>{formatTokens(s.totalTokens)}</span>
                      {s.cost > 0 && <span style={{ fontSize: 10, color: 'var(--blue)', fontFamily: 'monospace' }}>${s.cost.toFixed(2)}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <div className="bar-t" style={{ flex: 1 }}>
                        <div className="bar-f" style={{ width: `${pct}%`, background: pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--amber)' : 'var(--blue)' }} />
                      </div>
                      {pct > 50 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (cleaning) return;
                            if (!confirm('清理此会话的上下文？将保留最近 20% 的消息。')) return;
                            setCleaning(s.sessionId);
                            api.cleanupSession(s.sessionId)
                              .then(() => { refresh(); })
                              .catch((err: Error) => alert('清理失败: ' + err.message))
                              .finally(() => setCleaning(null));
                          }}
                          disabled={cleaning === s.sessionId}
                          style={{
                            padding: '2px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: 'rgba(255,59,48,0.08)', color: 'var(--red)',
                            fontSize: 10, fontWeight: 600, flexShrink: 0,
                            opacity: cleaning === s.sessionId ? 0.5 : 1,
                          }}>
                          {cleaning === s.sessionId ? '...' : '清理'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </button>
              {open && <Msgs sid={s.sessionId} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{
    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
    background: on ? 'rgba(0,122,255,0.08)' : 'var(--card)', color: on ? 'var(--blue)' : 'var(--text-2)',
    border: `1px solid ${on ? 'rgba(0,122,255,0.15)' : 'var(--border)'}`, whiteSpace: 'nowrap',
  }}>{children}</button>;
}

function Msgs({ sid }: { sid: string }) {
  const { data: msgs, loading } = useApi(() => api.getSessionMessages(sid), [sid]);
  if (loading) return <div style={{ padding: '8px 14px 14px' }}><div className="sh" style={{ height: 40 }} /></div>;
  return (
    <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border)' }}>
      <div style={{ height: 6 }} />
      {msgs?.slice(-6).map((m, i) => (
        <div key={i} style={{
          fontSize: 12, padding: '7px 10px', borderRadius: 10, lineHeight: 1.5, color: 'var(--text-2)',
          background: m.role === 'user' ? 'rgba(0,122,255,0.06)' : 'var(--card-alt)',
          marginLeft: m.role === 'user' ? 20 : 0, marginRight: m.role === 'assistant' ? 20 : 0,
        }}>
          <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{m.content}</div>
        </div>
      ))}
    </div>
  );
}

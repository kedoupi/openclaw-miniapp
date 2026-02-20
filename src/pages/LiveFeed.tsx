import { useState, useEffect, useRef } from 'react';
import { getAuthToken } from '../api/client';
import { AGENT_META } from '../types';

interface LiveEvent {
  timestamp: string;
  session: string;
  role: string;
  content: string;
  status?: string;
}

export function LiveFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    const url = `/api/live${token ? `?token=${token}` : ''}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as LiveEvent;
        if (data.status === 'connected') {
          setConnected(true);
          return;
        }
        setEvents(prev => {
          const next = [data, ...prev];
          return next.slice(0, 100);
        });
      } catch {}
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  function getAgentFromSession(session: string): { emoji: string; label: string } | null {
    for (const [id, meta] of Object.entries(AGENT_META)) {
      if (session.toLowerCase().includes(meta.label) || session.toLowerCase().includes(id)) {
        return meta;
      }
    }
    return null;
  }

  function formatTime(ts: string): string {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return '-'; }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>实时活动</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{events.length} 条事件</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={connected ? 'live-dot' : 'dot dot-r'} />
          <span style={{ fontSize: 11, color: connected ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {connected ? 'LIVE' : '断开'}
          </span>
        </div>
      </div>

      {events.length === 0 && (
        <div className="c" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
          <div style={{ fontSize: 13 }}>等待新事件...</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Agent 活动将实时显示在这里</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.map((ev, i) => {
          const agent = getAgentFromSession(ev.session);
          const isUser = ev.role === 'user';
          return (
            <div key={i} className="c" style={{ padding: '10px 14px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>{agent?.emoji || '🤖'}</span>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.session}
                </span>
                <span className="badge" style={{
                  background: isUser ? 'rgba(0,122,255,0.08)' : 'var(--card-alt)',
                  color: isUser ? 'var(--blue)' : 'var(--text-3)',
                  fontSize: 10
                }}>
                  {ev.role}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'SF Mono, monospace', flexShrink: 0 }}>
                  {formatTime(ev.timestamp)}
                </span>
              </div>
              <div style={{
                fontSize: 12, lineHeight: 1.5, color: 'var(--text-2)',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden'
              }}>
                {ev.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

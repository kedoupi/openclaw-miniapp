import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { getAgentMeta } from '../types';
import { countdown, formatDuration, shortModel, timeAgo } from '../utils/format';

export function Crons() {
  const { data: crons, loading, refresh } = useApi(api.getCrons);
  const [toggling, setToggling] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const sorted = crons ? [...crons].sort((a, b) => (a.nextRunAt || Infinity) - (b.nextRunAt || Infinity)) : [];

  const handleToggle = async (id: string, current: boolean) => {
    setToggling(id);
    try {
      await api.toggleCron(id, !current);
      await refresh();
    } catch (e: any) {
      alert('切换失败: ' + e.message);
    } finally { setToggling(null); }
  };

  const handleRun = async (id: string) => {
    setRunning(id);
    try {
      await api.runCron(id);
    } catch (e: any) {
      alert('执行失败: ' + e.message);
    } finally {
      setTimeout(() => setRunning(null), 2000);
    }
  };

  if (loading) return <div style={{ padding: 16 }}>{[1,2,3].map(i => <div key={i} className="sh" style={{ height: 100, marginBottom: 8 }} />)}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>定时任务</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{sorted.filter(c => c.enabled).length} 启用 / {sorted.length} 总计</p>
        </div>
        <button onClick={refresh} className="c" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, color: 'var(--blue)', cursor: 'pointer' }}>刷新</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(cr => {
          const m = getAgentMeta(cr.agentId);
          const ok = cr.lastStatus === 'ok';
          const er = cr.lastStatus === 'error';
          const busy = toggling === cr.id;
          const isRunning = running === cr.id;
          return (
            <div key={cr.id} className="c" style={{ padding: 14, opacity: busy ? 0.6 : 1, transition: 'opacity 0.2s', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="av" style={{ width: 30, height: 30, borderRadius: 8, fontSize: 14 }}>{m?.emoji || '❓'}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{cr.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{m?.label || cr.agentId}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => handleRun(cr.id)}
                    disabled={isRunning}
                    style={{
                      width: 30, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: isRunning ? 'rgba(52,199,89,0.15)' : 'rgba(0,122,255,0.08)',
                      color: isRunning ? 'var(--green)' : 'var(--blue)',
                      fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    {isRunning ? '✓' : '▶'}
                  </button>
                  <button
                    onClick={() => handleToggle(cr.id, cr.enabled)}
                    disabled={busy}
                    style={{
                      width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                      background: cr.enabled ? 'var(--green)' : 'var(--toggle-off)',
                      position: 'relative', transition: 'background 0.2s',
                    }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 11, background: '#fff',
                      position: 'absolute', top: 2,
                      left: cr.enabled ? 20 : 2,
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                <div className="ci" style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>模型</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 500 }}>{shortModel(cr.model)}</div>
                </div>
                <div className="ci" style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>调度</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{cr.schedule}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>下次</div>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: 'var(--blue)', marginTop: 2 }}>{countdown(cr.nextRunAt)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>上次</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, justifyContent: 'flex-end' }}>
                    <span style={{ color: ok ? 'var(--green)' : er ? 'var(--red)' : 'var(--text-3)' }}>{ok ? '✓' : er ? '✗' : '—'}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)' }}>{timeAgo(cr.lastRunAt)}</span>
                    {cr.lastDuration > 0 && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{formatDuration(cr.lastDuration)}</span>}
                  </div>
                </div>
              </div>

              {/* History toggle */}
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setHistoryOpen(historyOpen === cr.id ? null : cr.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: 'var(--blue)', fontWeight: 500, padding: '4px 0',
                  }}>
                  {historyOpen === cr.id ? '收起历史 ↑' : '执行历史 ↓'}
                </button>
                {historyOpen === cr.id && <CronHistory cronId={cr.id} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CronHistory({ cronId }: { cronId: string }) {
  const { data: history, loading } = useApi(() => api.getCronHistory(cronId), [cronId]);

  if (loading) return <div className="sh" style={{ height: 40, marginTop: 6 }} />;

  if (!history || history.length === 0) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 0', textAlign: 'center' }}>
        暂无执行记录
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {history.map((h, i) => (
        <div key={i} className="ci" style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: h.status === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>
              {h.status === 'ok' ? '✓' : '✗'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
              {new Date(h.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {h.duration && h.duration > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>
                {formatDuration(h.duration)}
              </span>
            )}
            {h.trigger && (
              <span className="badge" style={{ background: h.trigger === 'manual' ? 'rgba(0,122,255,0.08)' : 'var(--card-alt)', color: h.trigger === 'manual' ? 'var(--blue)' : 'var(--text-3)', fontSize: 9 }}>
                {h.trigger === 'manual' ? '手动' : '定时'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

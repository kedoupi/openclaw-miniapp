import { useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { AGENT_META } from '../types';
import { formatCost } from '../utils/format';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const C = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5856d6', '#64d2ff'];

export function Costs() {
  const { data: costs, loading: cl } = useApi(api.getCosts);
  const { data: cba, loading: al } = useApi(api.getCostsByAgent);
  const { data: usage } = useApi(api.getUsage);

  const md = useMemo(() => {
    if (!costs?.perModel) return [];
    return Object.entries(costs.perModel).map(([n, v]) => ({ name: n.split('/').pop() || n, value: v }))
      .filter(d => d.value > 0.01).sort((a, b) => b.value - a.value).slice(0, 7);
  }, [costs]);

  const ad = useMemo(() => {
    if (!cba) return [];
    return cba.map(c => ({ name: AGENT_META[c.agentId]?.label || c.agentId, week: c.week }))
      .filter(d => d.week > 0.01).sort((a, b) => b.week - a.week);
  }, [cba]);

  const td = useMemo(() => {
    if (!costs?.perDay) return [];
    return Object.entries(costs.perDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
      .map(([d, v]) => ({ date: d.slice(5), value: v }));
  }, [costs]);

  if (cl || al) return <div style={{ padding: 16 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
    {[1,2,3,4].map(i => <div key={i} className="sh" style={{ height: 76 }} />)}
  </div></div>;

  const stats = [
    { l: '今日', v: costs?.today || 0, c: 'var(--text-1)' },
    { l: '本周', v: costs?.week || 0, c: 'var(--text-1)' },
    { l: '本月', v: costs?.month || 0, c: 'var(--text-1)' },
    { l: '累计', v: costs?.total || 0, c: 'var(--text-1)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '8px 0 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>费用</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {stats.map(s => (
          <div key={s.l} className="c" style={{ padding: '14px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'SF Mono, monospace', color: s.c, marginTop: 4, letterSpacing: '-0.03em' }}>{formatCost(s.v)}</div>
          </div>
        ))}
      </div>

      {usage?.burnRate && usage.burnRate.costPerMinute > 0 && (
        <div className="c" style={{ padding: 14, display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>tokens/min</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)', marginTop: 2 }}>{Math.round(usage.burnRate.tokensPerMinute)}</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>$/min</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)', marginTop: 2 }}>${usage.burnRate.costPerMinute.toFixed(4)}</div>
          </div>
        </div>
      )}

      {td.length > 2 && (
        <div className="c" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>14天趋势</div>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={td}>
                <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--blue)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--blue)" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip formatter={(v: any) => formatCost(Number(v))} />
                <Area type="monotone" dataKey="value" stroke="var(--blue)" strokeWidth={2} fill="url(#ag)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {md.length > 0 && (
        <div className="c" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>按模型</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 96, height: 96 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={md} cx="50%" cy="50%" innerRadius={26} outerRadius={42} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {md.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                </Pie></PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {md.map((e, i) => (
                <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: C[i % C.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 500 }}>{formatCost(e.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {ad.length > 0 && (
        <div className="c" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>按 AGENT (本周)</div>
          <div style={{ height: Math.max(ad.length * 30, 80) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ad} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} width={44} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => formatCost(Number(v))} />
                <Bar dataKey="week" fill="var(--blue)" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

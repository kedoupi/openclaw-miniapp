import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { formatUptime } from '../utils/format';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function System() {
  const { data: sys, refresh } = useApi(api.getSystem);
  const { data: hist } = useApi(api.getHealthHistory);
  const { data: svcs } = useApi(api.getServices);
  const cd = hist?.map(h => ({
    time: new Date(h.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    cpu: h.cpu, ram: h.ram,
  })) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>系统</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>运行 {formatUptime(sys?.uptime || 0)}</p>
        </div>
        <button onClick={refresh} className="c" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, color: 'var(--blue)', cursor: 'pointer' }}>刷新</button>
      </div>

      {sys && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Res icon="⚡" label="CPU" val={sys.cpu?.usage ?? 0} detail={`负载 ${sys.loadAvg?.['1m'] || '-'} / ${sys.loadAvg?.['5m'] || '-'} / ${sys.loadAvg?.['15m'] || '-'}`} />
          <Res icon="🧠" label="内存" val={sys.memory?.percent ?? 0} detail={`${sys.memory?.usedGB || 0} / ${sys.memory?.totalGB || 0} GB · ${sys.memory?.freeGB || 0} GB 空闲`} />
          <Res icon="💿" label="磁盘" val={sys.disk?.percent ?? 0} detail={`${sys.disk?.used || '-'} / ${sys.disk?.total || '-'}`} />
        </div>
      )}

      {cd.length > 0 && (
        <div className="c" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>24小时</div>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cd}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--blue)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--blue)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--green)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--green)" stopOpacity={0} /></linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} domain={[0, 100]} width={28} />
                <Tooltip />
                <Area type="monotone" dataKey="cpu" stroke="var(--blue)" strokeWidth={1.5} fill="url(#cg)" name="CPU" />
                <Area type="monotone" dataKey="ram" stroke="var(--green)" strokeWidth={1.5} fill="url(#rg)" name="内存" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 3, borderRadius: 2, background: 'var(--blue)' }} /><span style={{ fontSize: 10, color: 'var(--text-3)' }}>CPU</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 3, borderRadius: 2, background: 'var(--green)' }} /><span style={{ fontSize: 10, color: 'var(--text-3)' }}>内存</span></div>
          </div>
        </div>
      )}

      {svcs && svcs.length > 0 && (
        <div className="c" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>服务</div>
          {svcs.map(s => (
            <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span style={{ fontSize: 13 }}>{s.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`dot ${s.active ? 'dot-g' : s.active === false ? 'dot-r' : ''}`} style={s.active === null ? { background: 'var(--text-3)' } : {}} />
                <span style={{ fontSize: 11, color: s.active ? 'var(--green)' : s.active === false ? 'var(--red)' : 'var(--text-3)' }}>
                  {s.active ? '运行中' : s.active === false ? '停止' : '未知'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function Res({ icon, label, val, detail }: { icon: string; label: string; val: number; detail: string }) {
  const color = val > 85 ? 'var(--red)' : val > 60 ? 'var(--amber)' : 'var(--blue)';
  return (
    <div className="c" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 15 }}>{icon}</span><span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span></div>
        <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color }}>{Math.round(val)}%</span>
      </div>
      <div className="bar-t" style={{ height: 5 }}><div className="bar-f" style={{ width: `${val}%`, background: color }} /></div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{detail}</div>
    </div>
  );
}

// removed KV - was only used by Tailscale section

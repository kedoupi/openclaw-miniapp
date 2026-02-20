import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { getAgentMeta } from '../types';

type View = 'menu' | 'skills' | 'files' | 'editor' | 'memory' | 'memory-view' | 'topology' | 'budget';

export function Config() {
  const [view, setView] = useState<View>('menu');
  const [editAgent, setEditAgent] = useState('');
  const [editFile, setEditFile] = useState('');

  if (view === 'skills') return <Skills onBack={() => setView('menu')} />;
  if (view === 'files') return <AgentFiles onBack={() => setView('menu')} onEdit={(a, f) => { setEditAgent(a); setEditFile(f); setView('editor'); }} />;
  if (view === 'editor') return <FileEditor agent={editAgent} file={editFile} onBack={() => setView('files')} />;
  if (view === 'memory') return <MemoryBrowser onBack={() => setView('menu')} onView={(a, f) => { setEditAgent(a); setEditFile(f); setView('memory-view'); }} />;
  if (view === 'memory-view') return <MemoryViewer agent={editAgent} file={editFile} onBack={() => setView('memory')} />;
  if (view === 'topology') return <Topology onBack={() => setView('menu')} />;
  if (view === 'budget') return <BudgetSettings onBack={() => setView('menu')} />;

  const items = [
    { icon: '🧩', title: '技能', desc: '全局技能 + Agent 私有技能', view: 'skills' as View },
    { icon: '📄', title: 'Agent 文件', desc: '查看编辑 SOUL.md、MEMORY.md 等', view: 'files' as View },
    { icon: '🧠', title: '记忆浏览', desc: '每日日记 · memory/*.md', view: 'memory' as View },
    { icon: '🔗', title: 'Agent 拓扑', desc: '团队协作关系图', view: 'topology' as View },
    { icon: '💰', title: '预算设置', desc: '设置月度费用预算', view: 'budget' as View },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '8px 0 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>配置</h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>技能 · 文件 · 记忆 · 拓扑</p>
      </div>
      {items.map(it => (
        <button key={it.view} className="c" onClick={() => setView(it.view)} style={{ padding: 16, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', color: 'inherit', background: 'var(--card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>{it.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{it.desc}</div>
            </div>
          </div>
          <span style={{ color: 'var(--text-3)', fontSize: 18 }}>›</span>
        </button>
      ))}
    </div>
  );
}

/* ==================== Skills ==================== */
function Skills({ onBack }: { onBack: () => void }) {
  const { data, loading } = useApi(api.getSkills);
  if (loading) return <Loading />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header title="技能" onBack={onBack} />
      <div>
        <SectionLabel>全局技能 ({data?.global?.length || 0})</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data?.global?.map(sk => (
            <div key={sk.name} className="c" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{sk.name}</span>
                <span className="badge" style={{ background: sk.source === 'user' ? 'rgba(0,122,255,0.08)' : 'var(--card-alt)', color: sk.source === 'user' ? 'var(--blue)' : 'var(--text-3)', fontSize: 10 }}>
                  {sk.source === 'user' ? '自定义' : '内置'}
                </span>
              </div>
              {sk.description && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.4 }}>{sk.description.substring(0, 100)}</div>}
            </div>
          ))}
        </div>
      </div>
      {data?.perAgent && Object.keys(data.perAgent).length > 0 && (
        <div>
          <SectionLabel>Agent 私有技能</SectionLabel>
          {Object.entries(data.perAgent).map(([agentId, skills]) => {
            const meta = getAgentMeta(agentId);
            return (
              <div key={agentId} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>{meta?.emoji || '❓'}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{meta?.label || agentId}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({skills.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {skills.map(sk => (
                    <div key={sk.name} className="c" style={{ padding: '8px 14px' }}>
                      <div style={{ fontWeight: 500, fontSize: 12 }}>{sk.name}</div>
                      {sk.description && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sk.description.substring(0, 80)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ==================== Agent Files ==================== */
function AgentFiles({ onBack, onEdit }: { onBack: () => void; onEdit: (agent: string, file: string) => void }) {
  const { data, loading } = useApi(api.getAgentFiles);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (loading) return <Loading />;
  const coreFiles = ['SOUL.md', 'AGENTS.md', 'MEMORY.md', 'TOOLS.md', 'IDENTITY.md', 'USER.md', 'HEARTBEAT.md'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header title="Agent 文件" onBack={onBack} />
      {data && Object.entries(data).map(([agentId, files]) => {
        const meta = getAgentMeta(agentId); const open = expanded === agentId;
        const sorted = [...files].sort((a, b) => { const ai = coreFiles.indexOf(a.name); const bi = coreFiles.indexOf(b.name); if (ai >= 0 && bi >= 0) return ai - bi; if (ai >= 0) return -1; if (bi >= 0) return 1; return a.name.localeCompare(b.name); });
        return (
          <div key={agentId}>
            <button className="c" onClick={() => setExpanded(open ? null : agentId)} style={{ width: '100%', padding: '12px 14px', textAlign: 'left', cursor: 'pointer', border: 'none', color: 'inherit', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="av" style={{ width: 32, height: 32, borderRadius: 8, fontSize: 14 }}>{meta?.emoji || '❓'}</div>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{meta?.label || agentId}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{files.length} 文件</div></div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
            </button>
            {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {sorted.map(f => (
                <button key={f.name} className="c" onClick={() => onEdit(agentId, f.name)} style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', border: 'none', color: 'inherit', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: coreFiles.includes(f.name) ? 'var(--blue)' : 'var(--text-2)' }}>📝</span>
                    <span style={{ fontSize: 13, fontWeight: coreFiles.includes(f.name) ? 600 : 400 }}>{f.name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{(f.size / 1024).toFixed(1)}K</span>
                </button>
              ))}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

/* ==================== File Editor ==================== */
function FileEditor({ agent, file, onBack }: { agent: string; file: string; onBack: () => void }) {
  const meta = getAgentMeta(agent);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    api.getAgentFile(agent, file).then(text => { setContent(text); setOriginal(text); }).catch(e => setMsg('加载失败: ' + e.message)).finally(() => setLoading(false));
  }, [agent, file]);

  const dirty = content !== original;
  const handleSave = async () => {
    setSaving(true); setMsg('');
    try { await api.saveAgentFile(agent, file, content); setOriginal(content); setMsg('✅ 已保存'); setTimeout(() => setMsg(''), 2000); }
    catch (e: any) { setMsg('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>← 返回</button>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{meta?.emoji} {meta?.label} / {file}</div>
        </div>
        {dirty && <button onClick={handleSave} disabled={saving} style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'var(--blue)', color: '#fff', opacity: saving ? 0.6 : 1 }}>{saving ? '...' : '保存'}</button>}
      </div>
      {msg && <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: msg.startsWith('✅') ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)', color: msg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{msg}</div>}
      {loading ? <div className="sh" style={{ height: 300 }} /> : (
        <textarea value={content} onChange={e => setContent(e.target.value)} spellCheck={false}
          style={{ width: '100%', minHeight: 400, padding: 14, borderRadius: 12, background: 'var(--card)', border: dirty ? '2px solid var(--blue)' : '1px solid var(--border)', color: 'var(--text-1)', fontSize: 12, fontFamily: 'SF Mono, Menlo, monospace', lineHeight: 1.6, resize: 'vertical', outline: 'none' }} />
      )}
    </div>
  );
}

/* ==================== Memory Browser ==================== */
function MemoryBrowser({ onBack, onView }: { onBack: () => void; onView: (agent: string, file: string) => void }) {
  const { data, loading } = useApi(api.getAgentMemory);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (loading) return <Loading />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header title="记忆浏览" onBack={onBack} />
      {data && Object.entries(data).map(([agentId, files]) => {
        const meta = getAgentMeta(agentId); const open = expanded === agentId;
        if (files.length === 0) return null;
        return (
          <div key={agentId}>
            <button className="c" onClick={() => setExpanded(open ? null : agentId)} style={{ width: '100%', padding: '12px 14px', textAlign: 'left', cursor: 'pointer', border: 'none', color: 'inherit', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="av" style={{ width: 32, height: 32, borderRadius: 8, fontSize: 14 }}>{meta?.emoji || '❓'}</div>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{meta?.label || agentId}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{files.length} 条日记</div></div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
            </button>
            {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {files.map(f => {
                const dateMatch = f.name.match(/(\d{4}-\d{2}-\d{2})/);
                const isToday = dateMatch && dateMatch[1] === new Date().toISOString().slice(0, 10);
                return (
                  <button key={f.name} className="c" onClick={() => onView(agentId, f.name)} style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', border: 'none', color: 'inherit', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13 }}>{isToday ? '📅' : '📋'}</span>
                      <span style={{ fontSize: 13, fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--blue)' : 'var(--text-1)' }}>{f.name.replace('.md', '')}</span>
                      {isToday && <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 500 }}>今天</span>}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{(f.size / 1024).toFixed(1)}K</span>
                  </button>
                );
              })}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

/* ==================== Memory Viewer ==================== */
function MemoryViewer({ agent, file, onBack }: { agent: string; file: string; onBack: () => void }) {
  const meta = getAgentMeta(agent);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getAgentMemoryFile(agent, file).then(setContent).catch(() => setContent('加载失败')).finally(() => setLoading(false));
  }, [agent, file]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header title={`${meta?.emoji || ''} ${file.replace('.md', '')}`} onBack={onBack} />
      {loading ? <div className="sh" style={{ height: 300 }} /> : (
        <div className="c" style={{ padding: 14, fontSize: 12, fontFamily: 'SF Mono, Menlo, monospace', lineHeight: 1.7, color: 'var(--text-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {content}
        </div>
      )}
    </div>
  );
}

/* ==================== Topology ==================== */
function Topology({ onBack }: { onBack: () => void }) {
  const { data, loading } = useApi(api.getTopology);

  if (loading) return <Loading />;
  if (!data || data.nodes.length === 0) return <div><Header title="Agent 拓扑" onBack={onBack} /><div className="c" style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>无数据</div></div>;

  const W = 320, H = 320;
  const hub = data.nodes.find(n => n.default) || data.nodes[0];
  const others = data.nodes.filter(n => n.id !== hub.id);
  const cx = W / 2, cy = H / 2, r = 115;
  const pos: Record<string, { x: number; y: number }> = {};
  pos[hub.id] = { x: cx, y: cy };
  others.forEach((n, i) => {
    const angle = (i / others.length) * Math.PI * 2 - Math.PI / 2;
    pos[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header title="Agent 拓扑" onBack={onBack} />
      <div className="c" style={{ padding: 14, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,1 L7,4 L0,7" fill="var(--blue)" /></marker>
            <marker id="arrow-gray" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,1 L7,4 L0,7" fill="var(--topo-edge)" /></marker>
          </defs>
          {/* Edges */}
          {data.edges.map((e, i) => {
            const from = pos[e.from], to = pos[e.to];
            if (!from || !to) return null;
            const dx = to.x - from.x, dy = to.y - from.y, len = Math.sqrt(dx*dx + dy*dy);
            if (len < 1) return null;
            const nx = dx/len, ny = dy/len;
            const x1 = from.x + nx * 28, y1 = from.y + ny * 28;
            const x2 = to.x - nx * 28, y2 = to.y - ny * 28;
            const isSpawn = e.type === 'spawn';
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isSpawn ? 'var(--blue)' : 'var(--topo-edge)'} strokeWidth={isSpawn ? 2 : 1}
              strokeDasharray={isSpawn ? undefined : '6,4'}
              markerEnd={isSpawn ? 'url(#arrow-blue)' : 'url(#arrow-gray)'} />;
          })}
          {/* Nodes */}
          {data.nodes.map(n => {
            const p = pos[n.id]; if (!p) return null;
            const meta = getAgentMeta(n.id); const isHub = n.id === hub.id;
            const sz = isHub ? 26 : 22;
            return (
              <g key={n.id}>
                <circle cx={p.x} cy={p.y} r={sz} fill={isHub ? 'var(--blue)' : 'var(--topo-node-fill)'} stroke={isHub ? 'var(--blue)' : 'var(--topo-node-stroke)'} strokeWidth={isHub ? 2 : 1} />
                <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={isHub ? 20 : 16}>{meta?.emoji || '❓'}</text>
                <text x={p.x} y={p.y + sz + 14} textAnchor="middle" fontSize="11" fontWeight={isHub ? 600 : 400} fill="var(--topo-text)">{meta?.label || n.id}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="c" style={{ padding: 14 }}>
        <SectionLabel>图例</SectionLabel>
        <div style={{ display: 'flex', gap: 20, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 2, background: 'var(--blue)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Spawn 调用</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 0, borderTop: '2px dashed var(--topo-edge)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>调度关系</span>
          </div>
        </div>
      </div>
      <div className="c" style={{ padding: 14 }}>
        <SectionLabel>Agent 列表</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          {data.nodes.map(n => {
            const meta = getAgentMeta(n.id);
            return (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{meta?.emoji || '❓'}</span>
                  <span style={{ fontSize: 13, fontWeight: n.default ? 600 : 400 }}>{meta?.label || n.id}</span>
                  {n.default && <span className="badge" style={{ background: 'rgba(0,122,255,0.08)', color: 'var(--blue)', fontSize: 9 }}>调度中心</span>}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>{String(typeof n.model === 'string' ? n.model : (n.model as any)?.primary || '').split('/').pop()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ==================== Budget Settings (Feature 3) ==================== */
function BudgetSettings({ onBack }: { onBack: () => void }) {
  const { data: budget, loading, refresh } = useApi(api.getBudget);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (budget) setAmount(String(budget.monthly));
  }, [budget]);

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < 0) {
      setMsg('❌ 请输入有效金额');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      await api.setBudget(val);
      setMsg('✅ 已保存');
      refresh();
      setTimeout(() => setMsg(''), 2000);
    } catch (e: any) {
      setMsg('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header title="预算设置" onBack={onBack} />

      {budget && (
        <div className="c" style={{ padding: 16 }}>
          <SectionLabel>当前状态</SectionLabel>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>本月花费</span>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'SF Mono, monospace', color: budget.percent > 100 ? 'var(--red)' : budget.percent > 80 ? 'var(--amber)' : 'var(--text-1)' }}>
              ${budget.spent.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>月度预算</span>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'SF Mono, monospace', color: 'var(--text-1)' }}>${budget.monthly.toFixed(2)}</span>
          </div>
          <div className="bar-t" style={{ height: 6 }}>
            <div className="bar-f" style={{
              width: `${Math.min(budget.percent, 100)}%`,
              background: budget.percent > 100 ? 'var(--red)' : budget.percent > 80 ? 'var(--amber)' : 'var(--green)',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>{budget.percent}%</div>
        </div>
      )}

      <div className="c" style={{ padding: 16 }}>
        <SectionLabel>设置月度预算 (USD)</SectionLabel>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="100"
            step="10"
            min="0"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 16,
              border: '1px solid var(--border)', background: 'var(--card-alt)', color: 'var(--text-1)',
              fontFamily: 'SF Mono, monospace', outline: 'none',
            }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--blue)', color: '#fff', fontSize: 14, fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? '...' : '保存'}
          </button>
        </div>
        {msg && (
          <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{msg}</div>
        )}
      </div>

      <div className="c" style={{ padding: 16 }}>
        <SectionLabel>快捷设置</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[50, 100, 200, 500].map(v => (
            <button key={v} onClick={() => setAmount(String(v))} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: amount === String(v) ? 'rgba(0,122,255,0.08)' : 'var(--card-alt)',
              color: amount === String(v) ? 'var(--blue)' : 'var(--text-2)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
              ${v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==================== Shared Components ==================== */
function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 0' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>← 返回</button>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>{title}</h1>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>{children}</div>;
}

function Loading() {
  return <div style={{ padding: 16 }}>{[1,2,3].map(i => <div key={i} className="sh" style={{ height: 60, marginBottom: 8 }} />)}</div>;
}

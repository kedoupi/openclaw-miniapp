import type { TabId } from '../types';

const TABS: { id: TabId; label: string; d: string }[] = [
  { id: 'dashboard', label: '总览', d: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { id: 'sessions', label: '会话', d: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
  { id: 'crons', label: '定时', d: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4v6l4 2' },
  { id: 'costs', label: '费用', d: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
  { id: 'live', label: '活动', d: 'M13 2L3 14h9l-1 10 10-12h-9l1-10z' },
  { id: 'system', label: '系统', d: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09c-.66.003-1.25.396-1.51 1z' },
  { id: 'config', label: '配置', d: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z' },
];

export function Layout({ children, activeTab, onTabChange }: { children: React.ReactNode; activeTab: TabId; onTabChange: (t: TabId) => void }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="page fi">{children}</div>
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className="tab-btn" onClick={() => onTabChange(t.id)}
            style={{ color: activeTab === t.id ? 'var(--blue)' : 'var(--text-3)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={activeTab === t.id ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d={t.d} />
            </svg>
            <span style={{ fontSize: 10, fontWeight: activeTab === t.id ? 600 : 400 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

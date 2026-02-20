import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { Dashboard } from './pages/Dashboard';
import { Sessions } from './pages/Sessions';
import { Crons } from './pages/Crons';
import { Costs } from './pages/Costs';
import { System } from './pages/System';
import { Config } from './pages/Config';
import { LiveFeed } from './pages/LiveFeed';
import { Layout } from './components/Layout';
import { populateAgentMeta } from './types';
import type { TabId } from './types';
import { api } from './api/client';

function App() {
  const { authenticated, loading, error } = useAuth();
  const [tab, setTab] = useState<TabId>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  // Load agent metadata from topology API
  useEffect(() => {
    if (authenticated) {
      api.getTopology().then(data => {
        if (data?.nodes) populateAgentMeta(data.nodes);
      }).catch(() => {});
    }
  }, [authenticated]);

  // Dark mode detection
  useEffect(() => {
    function applyTheme() {
      const colorScheme = window.Telegram?.WebApp?.colorScheme;
      if (colorScheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (colorScheme === 'light') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        // Fallback: check system preference
        if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      }
    }
    applyTheme();
    // Listen for theme changes from Telegram
    window.Telegram?.WebApp?.onEvent?.('themeChanged', applyTheme);
    // System preference fallback listener
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handler = () => { if (!window.Telegram?.WebApp?.colorScheme) applyTheme(); };
    mq?.addEventListener?.('change', handler);
    return () => { mq?.removeEventListener?.('change', handler); };
  }, []);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
  }, []);

  // Pull to refresh
  const touchStartY = useRef(0);
  const pullDist = useRef(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (pageRef.current && pageRef.current.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = 0;
    }
    pullDist.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartY.current) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0 && pageRef.current && pageRef.current.scrollTop <= 0) {
      pullDist.current = diff;
      if (diff > 30) setPulling(true);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pullDist.current > 60 && !refreshing) {
      setRefreshing(true);
      setRefreshKey(k => k + 1);
      setTimeout(() => { setRefreshing(false); setPulling(false); }, 800);
    } else {
      setPulling(false);
    }
    touchStartY.current = 0;
    pullDist.current = 0;
  }, [refreshing]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-3)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 13 }}>加载中...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--red)', padding: 24, textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 13 }}>{error}</div>
      </div>
    </div>
  );

  if (!authenticated) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-3)' }}>
      <div style={{ fontSize: 13 }}>请在 Telegram 中打开</div>
    </div>
  );

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      <div className={(pulling || refreshing) ? 'ptr-indicator active' : 'ptr-indicator'}>
        {refreshing ? <div className="ptr-spinner" /> : <span>↓ 下拉刷新</span>}
      </div>
      <div
        ref={pageRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ minHeight: '100%' }}
      >
        {tab === 'dashboard' && <Dashboard key={`d-${refreshKey}`} />}
        {tab === 'sessions' && <Sessions key={`s-${refreshKey}`} />}
        {tab === 'crons' && <Crons key={`cr-${refreshKey}`} />}
        {tab === 'costs' && <Costs key={`co-${refreshKey}`} />}
        {tab === 'system' && <System key={`sy-${refreshKey}`} />}
        {tab === 'config' && <Config key={`cf-${refreshKey}`} />}
        {tab === 'live' && <LiveFeed key={`lf-${refreshKey}`} />}
      </div>
    </Layout>
  );
}

export default App;

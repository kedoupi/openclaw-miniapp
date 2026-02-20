import { useState, useEffect } from 'react';
import { api, setAuthToken } from '../api/client';

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('oc_token');
    if (stored) {
      setAuthToken(stored);
      setAuthenticated(true);
      setLoading(false);
      return;
    }

    const webApp = window.Telegram?.WebApp;
    const initData = webApp?.initData;

    if (!initData) {
      // Dev mode: skip auth
      if ((import.meta as any).env?.DEV) {
        setAuthenticated(true);
        setLoading(false);
        return;
      }
      // IP direct access: skip Telegram auth
      const host = window.location.hostname;
      const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost' || host === '127.0.0.1';
      if (isIP) {
        setAuthenticated(true);
        setLoading(false);
        return;
      }
      setError('请在 Telegram 中打开');
      setLoading(false);
      return;
    }

    api
      .authTelegram(initData)
      .then(({ sessionToken }) => {
        setAuthToken(sessionToken);
        sessionStorage.setItem('oc_token', sessionToken);
        setAuthenticated(true);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { authenticated, loading, error };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        themeParams: Record<string, string>;
        colorScheme?: 'light' | 'dark';
        onEvent?: (event: string, callback: () => void) => void;
      };
    };
  }
}

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ShieldCheck } from 'lucide-react';
import { App } from '../../App';
import { AppProvider } from '../../providers/AppProvider';
import { AccountContext } from '../../providers/accountContext';
import { authClient } from '../../services/authClient';
import type { AuthConfig } from '../../services/authClient';
import { createHttpRepository } from '../../services/httpRepository';
import { LoginPage } from './LoginPage';
import {
  beginAuthRecovery,
  clearAuthRecovery,
  readAuthRecovery,
} from '../../services/sessionDrafts';

export function AuthGate() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const userId = session?.user.id;
  const repository = useMemo(() => (userId ? createHttpRepository(userId) : null), [userId]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((value: AuthConfig) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setConfigFailed(true);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (userId) beginAuthRecovery(userId, window.location.hash);
      void refetch();
    };
    window.addEventListener('kotoba-auth-expired', refresh);
    return () => window.removeEventListener('kotoba-auth-expired', refresh);
  }, [refetch, userId]);
  useEffect(() => {
    if (!userId || readAuthRecovery()?.userId !== userId) return;
    const timer = window.setTimeout(() => clearAuthRecovery());
    return () => window.clearTimeout(timer);
  }, [userId]);
  if (configFailed || (error && !session))
    return (
      <div className="auth-screen">
        <section className="auth-card">
          <BookOpen size={32} />
          <h1>サーバーに接続できません</h1>
          <p role="alert">通信状態を確認してから、もう一度お試しください。</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </section>
      </div>
    );
  if (!config || isPending)
    return (
      <div className="auth-screen">
        <section className="auth-card" role="status">
          <ShieldCheck size={32} />
          <h1>ログイン状態を確認中…</h1>
        </section>
      </div>
    );
  if (new URLSearchParams(window.location.search).has('reset') || !session || !repository)
    return <LoginPage config={config} />;
  return (
    <AccountContext.Provider value={{ user: session.user, config }}>
      <AppProvider key={session.user.id} repository={repository}>
        <App />
      </AppProvider>
    </AccountContext.Provider>
  );
}

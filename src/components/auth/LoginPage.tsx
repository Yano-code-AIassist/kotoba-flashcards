import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { authClient, authError } from '../../services/authClient';
import type { AuthConfig } from '../../services/authClient';
import { authReturnPath, readAuthRecovery } from '../../services/sessionDrafts';

export function LoginPage({ config }: { config: AuthConfig }) {
  const params = new URLSearchParams(window.location.search);
  const recovery = readAuthRecovery();
  const returnPath = authReturnPath();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>(
    params.has('reset') ? 'reset' : 'login',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(
    params.has('error') || params.has('authError')
      ? '外部サービスでの認証を完了できませんでした。登録済みの場合は元のログイン方法でログインし、設定から連携してください。'
      : null,
  );
  const [notice, setNotice] = useState<string | null>(
    recovery
      ? 'ログインの有効期限が切れました。入力中の内容を一時保存しています。再ログインすると元の画面へ戻ります。'
      : null,
  );
  const title = {
    login: 'おかえりなさい',
    signup: '学びを、ここから。',
    forgot: 'パスワードを再設定',
    reset: '新しいパスワード',
  }[mode];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if ((mode === 'signup' || mode === 'reset') && password !== confirmation) {
      setError('確認用パスワードが一致しません。');
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signup') {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: '/',
        });
        if (result.error) setError(authError(result.error.code));
        else if (config.emailVerification) {
          setNotice('確認メールを送信しました。メール内のリンクを開いて登録を完了してください。');
          setPassword('');
          setConfirmation('');
        } else window.location.replace('/');
      } else if (mode === 'login') {
        const result = await authClient.signIn.email({ email: email.trim(), password });
        if (result.error) setError(authError(result.error.code));
        else window.location.replace(returnPath);
      } else if (mode === 'forgot') {
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: `${window.location.origin}/?reset=1`,
        });
        if (result.error) setError(authError(result.error.code));
        else setNotice('登録済みのアドレスであれば、再設定用のメールを送信しました。');
      } else {
        const token = params.get('token');
        if (!token) {
          setError('再設定リンクが無効です。メールをもう一度送信してください。');
          return;
        }
        const result = await authClient.resetPassword({ token, newPassword: password });
        if (result.error) setError(authError(result.error.code));
        else {
          window.history.replaceState(null, '', '/');
          setMode('login');
          setPassword('');
          setConfirmation('');
          setNotice('パスワードを変更しました。ログインしてください。');
        }
      }
    } catch {
      setError('接続できませんでした。少し時間をおいて再試行してください。');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function social(provider: 'google' | 'line') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: returnPath,
        errorCallbackURL: `/?authError=1${recovery?.hash ?? ''}`,
      });
      if (result.error) setError(authError(result.error.code));
    } catch {
      setError('ログインを開始できませんでした。もう一度お試しください。');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function switchMode(next: typeof mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirmation('');
  }
  return (
    <main className="auth-screen">
      <div className="auth-intro">
        <a href="/" className="brand">
          <span className="brand-icon">
            <BookOpen size={24} />
          </span>
          <span>
            kotoba<span className="brand-dot">.</span>
          </span>
        </a>
        <p className="eyebrow">YOUR WORDS, YOUR WORLD</p>
        <h1>
          覚えたことが、
          <br />
          自分の力になる。
        </h1>
        <p>
          単語も、学習の続きも、あなたのアカウントに。
          <br />
          毎日の小さな積み重ねを、ここから。
        </p>
        <div className="auth-illustration" aria-hidden="true">
          <span>ことば</span>
          <BookOpen size={50} />
          <small>ひとつ覚える。少し進む。</small>
        </div>
      </div>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-heading">
          <LockKeyhole size={23} />
          <h2 id="auth-title">{title}</h2>
          <p>
            {mode === 'signup'
              ? '無料のアカウントを作成して、単語帳を保存しましょう。'
              : mode === 'login'
                ? 'ログインして、学びの続きを始めましょう。'
                : '登録したメールアドレスで手続きできます。'}
          </p>
        </div>
        {(mode === 'login' || mode === 'signup') && (
          <>
            <div className="auth-social">
              <button
                className="button button-secondary"
                disabled={busy || !config.google}
                onClick={() => void social('google')}
              >
                Googleでログイン{!config.google && <small>準備中</small>}
              </button>
              <button
                className="button auth-line"
                disabled={busy || !config.line}
                onClick={() => void social('line')}
              >
                LINEでログイン{!config.line && <small>準備中</small>}
              </button>
            </div>
            <div className="auth-divider">
              <span>またはメールで</span>
            </div>
          </>
        )}
        <form onSubmit={submit} className="auth-form">
          <fieldset disabled={busy}>
            {mode === 'signup' && (
              <label htmlFor="auth-name">
                表示名
                <input
                  id="auth-name"
                  autoComplete="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                />
              </label>
            )}
            {mode !== 'reset' && (
              <label htmlFor="auth-email">
                メールアドレス
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  required
                />
              </label>
            )}
            {mode !== 'forgot' && (
              <div className="auth-password-field">
                <label htmlFor="auth-password">
                  パスワード
                  <input
                    id="auth-password"
                    type="password"
                    aria-describedby={mode === 'login' ? undefined : 'auth-password-hint'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={mode === 'login' ? undefined : 10}
                    maxLength={128}
                    required
                  />
                </label>
                {mode !== 'login' && (
                  <small id="auth-password-hint">10〜128文字で入力してください。</small>
                )}
              </div>
            )}
            {(mode === 'signup' || mode === 'reset') && (
              <label htmlFor="auth-confirmation">
                パスワード（確認）
                <input
                  id="auth-confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                />
              </label>
            )}
          </fieldset>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="auth-notice" role="status">
              <Mail size={18} />
              {notice}
            </p>
          )}
          <button className="button button-primary" disabled={busy} type="submit">
            {busy
              ? '処理中…'
              : {
                  login: 'ログイン',
                  signup: 'アカウントを作成',
                  forgot: '再設定メールを送信',
                  reset: 'パスワードを変更',
                }[mode]}
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <button disabled={busy} onClick={() => switchMode('signup')}>
                初めての方：アカウントを作成
              </button>
              {config.passwordReset && (
                <button disabled={busy} onClick={() => switchMode('forgot')}>
                  パスワードを忘れた方
                </button>
              )}
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => {
                window.history.replaceState(null, '', '/');
                switchMode('login');
              }}
            >
              ログインに戻る
            </button>
          )}
        </div>
        <p className="auth-footnote">
          ログイン時に取得する表示名・メールアドレスは、アカウントの識別と認証・復旧に利用します。
        </p>
        <p className="auth-footnote">
          以前このブラウザーに保存した単語帳は、ログイン後の「設定」から取り込めます。
        </p>
      </section>
    </main>
  );
}

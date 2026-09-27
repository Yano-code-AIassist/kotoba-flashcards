import { useState } from 'react';
import { LogOut, UserRound, CloudUpload } from 'lucide-react';
import { useAccount } from '../../providers/accountContext';
import { useAppData } from '../../hooks/useAppData';
import { authClient, authError } from '../../services/authClient';
import { canLeave } from '../../services/navigation';
import { createLocalStorageRepository } from '../../services/localStorageRepository';
import { createHttpRepository } from '../../services/httpRepository';

export function AccountPanel() {
  const { user, config } = useAccount();
  const { data, isSaving, isLoading, hasExternalChanges, retryLoad } = useAppData();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    new URLSearchParams(window.location.search).has('authError')
      ? '外部アカウントとの連携を完了できませんでした。同じメールアドレスのアカウントで再試行してください。'
      : null,
  );
  const blocked = busy || isSaving || isLoading || hasExternalChanges;
  async function run(action: () => Promise<void>) {
    if (busy || isSaving || isLoading) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch {
      setError('処理できませんでした。接続を確認して再試行してください。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-panel account-panel" aria-labelledby="account-title">
      <h2 id="account-title">
        <UserRound size={21} />
        アカウント
      </h2>
      <p className="account-name">{user.name}</p>
      <p className="account-email">{user.email}</p>
      <p>単語帳・学習状態・設定は、このアカウントに保存します。</p>
      <div className="account-actions">
        {(['google', 'line'] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            className="button button-secondary"
            disabled={blocked || !config[provider]}
            onClick={() => {
              if (!canLeave()) return;
              void run(async () => {
                const result = await authClient.linkSocial({
                  provider,
                  callbackURL: '/#/settings',
                  errorCallbackURL: '/?authError=1#/settings',
                });
                if (result.error) setError(authError(result.error.code));
              });
            }}
          >
            {provider === 'google' ? 'Google' : 'LINE'}を連携{!config[provider] && '（準備中）'}
          </button>
        ))}
      </div>
      <p className="auth-footnote">
        別のログイン方法でも同じ単語帳を使うには、ここから連携してください。登録したメールアドレスと同じものを使います。
      </p>
      <hr />
      <h3>以前の単語帳を引き継ぐ</h3>
      <p>
        このブラウザーに残るデータを、現在のアカウントへコピーします。取り込みは、まだデータを保存していないアカウントで利用できます。元のデータは残ります。
      </p>
      <button
        type="button"
        className="button button-secondary"
        disabled={blocked || data.revision !== 0}
        onClick={() =>
          void run(async () => {
            if (!canLeave()) return;
            const local = await createLocalStorageRepository().load();
            if (!local.ok) {
              setError(local.error.message);
              return;
            }
            if (!local.value) {
              setMessage('このブラウザーには以前の保存データがありません。');
              return;
            }
            if (
              !window.confirm(
                `${local.value.decks.length}冊・${local.value.words.length}語を ${user.email} に取り込みますか？自分のデータであることを確認してください。`,
              )
            )
              return;
            const result = await createHttpRepository(user.id).save(
              { ...local.value, revision: 0 },
              0,
            );
            if (!result.ok) {
              setError(result.error.message);
              return;
            }
            setMessage('以前の単語帳を取り込みました。');
            retryLoad();
          })
        }
      >
        <CloudUpload size={18} />
        ブラウザーの単語帳を取り込む
      </button>
      {data.revision !== 0 && (
        <p className="auth-footnote">
          このアカウントには保存データがあります。追加の教材はCSV取込を利用してください。
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="auth-notice" role="status">
          {message}
        </p>
      )}
      <hr />
      <button
        type="button"
        className="button button-secondary"
        disabled={busy || isSaving || isLoading}
        onClick={() => {
          if (!canLeave()) return;
          void run(async () => {
            const result = await authClient.signOut();
            if (result.error) setError(authError(result.error.code));
            else window.location.replace('/');
          });
        }}
      >
        <LogOut size={18} />
        ログアウト
      </button>
    </section>
  );
}

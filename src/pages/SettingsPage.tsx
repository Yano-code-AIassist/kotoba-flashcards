import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, HardDrive, LoaderCircle, SlidersHorizontal } from 'lucide-react';
import { useAppData } from '../hooks/useAppData';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { STUDY_MODES } from '../services/studyService';
import { ErrorNotice } from '../components/common/ErrorNotice';
import { AccountPanel } from '../components/auth/AccountPanel';
import { MobileAccessButton } from '../components/common/MobileAccess';
import { useAccount } from '../providers/accountContext';
import { clearSessionDraft, readSessionDraft, saveSessionDraft } from '../services/sessionDrafts';
import type { AppSettings } from '../types/domain';

interface StoredSettingsDraft {
  initial: AppSettings;
  draft: AppSettings;
}

function isSettings(value: unknown): value is AppSettings {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    ['all', 'unlearned', 'learning', 'random'].includes(String(settings.defaultStudyMode)) &&
    typeof settings.swipeEnabled === 'boolean'
  );
}

function isStoredSettingsDraft(value: unknown): value is StoredSettingsDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    isSettings((value as Record<string, unknown>).initial) &&
    isSettings((value as Record<string, unknown>).draft)
  );
}

function sameSettings(left: AppSettings, right: AppSettings): boolean {
  return (
    left.defaultStudyMode === right.defaultStudyMode && left.swipeEnabled === right.swipeEnabled
  );
}

export function SettingsPage({ onNotice }: { onNotice: (message: string) => void }) {
  const { user } = useAccount();
  const { data, isSaving, hasExternalChanges, saveSettings } = useAppData();
  const [savedDraft] = useState(() => readSessionDraft(user.id, 'settings', isStoredSettingsDraft));
  const canRestore = savedDraft !== null && sameSettings(savedDraft.initial, data.settings);
  const [draft, setDraft] = useState({ ...(canRestore ? savedDraft!.draft : data.settings) });
  const [restored, setRestored] = useState(
    canRestore && !sameSettings(savedDraft!.draft, data.settings),
  );
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const dirty =
    draft.defaultStudyMode !== data.settings.defaultStudyMode ||
    draft.swipeEnabled !== data.settings.swipeEnabled;
  const { markSaved } = useUnsavedChanges(dirty, () => clearSessionDraft(user.id, 'settings'));
  const blocked = isSaving || hasExternalChanges;

  useEffect(() => {
    if (dirty) saveSessionDraft(user.id, 'settings', { initial: data.settings, draft });
    else clearSessionDraft(user.id, 'settings');
  }, [data.settings, dirty, draft, user.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || blocked || !dirty) return;
    pending.current = true;
    setError(null);
    try {
      const result = await saveSettings(draft);
      if (!result.ok) setError(result.error.message);
      else {
        clearSessionDraft(user.id, 'settings');
        markSaved();
        setRestored(false);
        onNotice('設定を保存しました。');
      }
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-heading">
        <p className="eyebrow">YOUR PREFERENCES</p>
        <h1>設定</h1>
        <p>学び方を、自分に合わせよう。</p>
      </header>
      <div className="settings-grid">
        <form className="settings-panel" aria-label="学習の設定" onSubmit={submit}>
          <h2>
            <SlidersHorizontal size={21} aria-hidden="true" /> 学習の設定
          </h2>
          <p className="settings-description">変更は「設定を保存」で反映します。</p>
          {restored && (
            <p className="draft-recovery-notice" role="status">
              ログイン前に変更していた設定を復元しました。
            </p>
          )}
          <fieldset
            className="settings-modes"
            disabled={blocked}
            aria-describedby="settings-mode-hint"
          >
            <legend>標準の出題方法</legend>
            <p id="settings-mode-hint">
              単語帳の詳細を開いたときに選ばれる方法です。学習を始める前にも変更できます。
            </p>
            {STUDY_MODES.map((mode) => (
              <label
                className={`settings-mode${draft.defaultStudyMode === mode.value ? ' selected' : ''}`}
                key={mode.value}
              >
                <input
                  type="radio"
                  name="default-study-mode"
                  value={mode.value}
                  checked={draft.defaultStudyMode === mode.value}
                  onChange={() => {
                    setDraft({ ...draft, defaultStudyMode: mode.value });
                    setError(null);
                  }}
                />
                <span>
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="settings-swipe">
            <label htmlFor="settings-swipe">
              <input
                id="settings-swipe"
                type="checkbox"
                checked={draft.swipeEnabled}
                disabled={blocked}
                aria-describedby="settings-swipe-hint"
                onChange={(event) => {
                  setDraft({ ...draft, swipeEnabled: event.target.checked });
                  setError(null);
                }}
              />
              スワイプで回答する
            </label>
            <p id="settings-swipe-hint">
              答えを見た後、左へ「まだ」、右へ「覚えた」。OFFでも回答ボタンを使えます。学習画面の切り替えとも共通です。
            </p>
          </div>
          <p className="settings-session-hint">
            設定を変えても、途中の学習の出題順や回答済みの状態は変わりません。
          </p>
          {error && <ErrorNotice message={error} />}
          <div className="settings-actions">
            <p role="status">{dirty ? '未保存の変更があります' : '変更はありません'}</p>
            <div>
              <button
                className="button button-secondary"
                type="button"
                disabled={!dirty || isSaving}
                onClick={() => {
                  setDraft({ ...data.settings });
                  setError(null);
                  clearSessionDraft(user.id, 'settings');
                  markSaved();
                  setRestored(false);
                }}
              >
                変更を取り消す
              </button>
              <button className="button button-primary" type="submit" disabled={!dirty || blocked}>
                {isSaving ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
                {isSaving ? '保存中…' : '設定を保存'}
              </button>
            </div>
          </div>
        </form>
        <aside className="settings-panel settings-storage" aria-labelledby="settings-storage-title">
          <h2 id="settings-storage-title">
            <HardDrive size={21} aria-hidden="true" /> 保存について
          </h2>
          <dl>
            <div>
              <dt>保存先</dt>
              <dd>ログイン中のアカウント</dd>
            </div>
            <div>
              <dt>登録内容</dt>
              <dd>
                {data.decks.length}冊・{data.words.length}語
              </dd>
            </div>
          </dl>
          <p>
            単語帳・学習状態・設定はサーバーに保存します。同じアカウントでログインすると、別の端末でも続きを使えます。
          </p>
          <p>
            他の端末からの変更は、再読み込みで反映できます。保存にはサーバーへの接続が必要です。
          </p>
          <p>
            教材を持ち出すときは、単語管理のCSV出力を使えます。CSVには学習状態や日時は含みません。
          </p>
          <a className="button button-secondary" href="#/manage">
            単語管理を開く
            <ArrowRight size={17} />
          </a>
        </aside>
      </div>
      <section className="settings-panel mobile-access-panel">
        <h2>スマホでも学習する</h2>
        <p>
          PCに表示したQRコードを読み取り、同じアカウントでログインすると、外出先でも単語帳を使えます。
        </p>
        <MobileAccessButton />
      </section>
      <AccountPanel />
    </div>
  );
}

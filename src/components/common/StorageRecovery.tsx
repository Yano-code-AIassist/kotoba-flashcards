import { useState } from 'react';
import { Download, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { useAppData } from '../../hooks/useAppData';
import { Dialog } from './Dialog';
import { ErrorNotice } from './ErrorNotice';
import { downloadTextFile } from '../../services/downloadFile';

export function StorageRecovery() {
  const { loadError, recoveryData, isSaving, retryLoad, resetStorage } = useAppData();
  const [confirmReset, setConfirmReset] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadStarted, setDownloadStarted] = useState(false);
  if (!loadError) return null;

  function downloadOriginal() {
    if (recoveryData === null) return;
    try {
      // 不正なJSONでも加工せず退避する。復元・調査に必要な元の内容を保つ。
      downloadTextFile(
        recoveryData,
        `kotoba-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        'application/json;charset=utf-8',
      );
      setDownloadStarted(true);
      setActionError(null);
    } catch {
      setActionError('元データをダウンロードできませんでした。もう一度お試しください。');
    }
  }

  return (
    <section className="storage-recovery" aria-labelledby="recovery-title">
      <ShieldAlert size={34} aria-hidden="true" />
      <h1 id="recovery-title">保存データを読み込めません</h1>
      <p role="alert">{loadError.message}</p>
      <p>データを保護するため、追加・編集・削除を停止しています。</p>
      {recoveryData !== null && (
        <p>
          まず元データをダウンロードして保管できます。別の形式のデータの場合は、対応するアプリで開いてください。初期化すると、このブラウザの単語帳・単語・学習状態・設定がすべて消えます。
        </p>
      )}
      <div className="storage-actions">
        <button
          type="button"
          className="button button-primary"
          onClick={retryLoad}
          disabled={isSaving}
        >
          <RefreshCw size={17} />
          もう一度読み込む
        </button>
        {recoveryData !== null && (
          <button
            type="button"
            className="button button-secondary"
            onClick={downloadOriginal}
            disabled={isSaving}
          >
            <Download size={17} />
            元データをダウンロード
          </button>
        )}
      </div>
      {downloadStarted && (
        <p role="status">
          ダウンロードを開始しました。初期化前にファイルが保存されたことを確認してください。
        </p>
      )}
      {actionError && !confirmReset && <ErrorNotice message={actionError} />}
      {recoveryData !== null && (
        <div className="storage-reset">
          <button
            type="button"
            className="button button-quiet-danger"
            disabled={isSaving}
            onClick={() => {
              setActionError(null);
              setConfirmReset(true);
            }}
          >
            <Trash2 size={16} />
            保存データを初期化…
          </button>
        </div>
      )}
      {confirmReset && recoveryData !== null && (
        <Dialog
          title="保存データを初期化しますか？"
          description="このブラウザに保存した単語帳・単語・学習状態・設定をすべて削除します。元に戻せません。必要な元データの保管を確認してください。"
          danger
          busy={isSaving}
          onClose={() => setConfirmReset(false)}
        >
          {actionError && <ErrorNotice message={actionError} />}
          <div className="dialog-actions">
            <button
              type="button"
              className="button button-secondary"
              data-initial-focus
              disabled={isSaving}
              onClick={() => setConfirmReset(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={isSaving}
              onClick={async () => {
                const result = await resetStorage(recoveryData);
                if (!result.ok) setActionError(result.error.message);
              }}
            >
              {isSaving ? '初期化中…' : '削除して初期化'}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

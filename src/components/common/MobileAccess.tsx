import { useEffect, useState } from 'react';
import { Copy, LoaderCircle, QrCode, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { Dialog } from './Dialog';

export function MobileAccessButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`button button-secondary mobile-access-button ${className}`}
        onClick={() => setOpen(true)}
      >
        <QrCode size={18} aria-hidden="true" />
        スマホで開く
      </button>
      {open && <MobileAccessDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function MobileAccessDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState<{ url: string; image: string } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'local' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/mobile-access', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const body: { url?: unknown } = await response.json();
        if (body.url === null) {
          if (!controller.signal.aborted) setStatus('local');
          return;
        }
        if (typeof body.url !== 'string') throw new Error();
        const url = new URL(body.url);
        if (url.protocol !== 'https:' || url.href !== `${url.origin}/`) throw new Error();
        const image = await QRCode.toDataURL(url.href, {
          errorCorrectionLevel: 'M',
          margin: 4,
          width: 320,
          color: { dark: '#152d27', light: '#ffffff' },
        });
        if (!controller.signal.aborted) {
          setValue({ url: url.href, image });
          setStatus('ready');
        }
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.url);
      setCopied('URLをコピーしました。');
    } catch {
      setCopied('コピーできませんでした。上のURLを長押し、または選択してコピーしてください。');
    }
  }

  return (
    <Dialog
      title="スマホで開く"
      description="同じアカウントで、PCの単語帳をスマホでも。"
      busy={false}
      onClose={onClose}
    >
      <div className="mobile-access-content">
        {status === 'loading' && (
          <p className="mobile-access-loading" role="status">
            <LoaderCircle className="spin" size={22} />
            QRコードを準備しています…
          </p>
        )}
        {status === 'local' && (
          <div className="mobile-access-unavailable">
            <Smartphone size={34} aria-hidden="true" />
            <h3>公開後にQRコードが表示されます</h3>
            <p>
              現在はこのPCで動作しています。外出先のスマホで使うには、アプリをインターネットに公開する必要があります。
            </p>
            <p>公開用のHTTPSアドレスが設定されると、この画面から読み取れるようになります。</p>
          </div>
        )}
        {status === 'error' && (
          <div>
            <p role="alert">QRコードを準備できませんでした。接続を確認して再度お試しください。</p>
            <button
              className="button button-secondary"
              onClick={() => {
                setStatus('loading');
                setAttempt(attempt + 1);
              }}
            >
              再試行
            </button>
          </div>
        )}
        {status === 'ready' && value && (
          <>
            <img
              className="mobile-access-qr"
              src={value.image}
              alt="スマホでアプリを開くQRコード"
              width={320}
              height={320}
            />
            <ol className="mobile-access-steps">
              <li>スマホのカメラでQRコードを読み取ります。</li>
              <li>SafariやChromeで開き、PCと同じアカウントでログインします。</li>
              <li>保存した単語帳を開いて、編集・学習を始めます。</li>
            </ol>
            <a className="mobile-access-url" href={value.url} target="_blank" rel="noreferrer">
              {value.url}
            </a>
            <button className="button button-secondary" onClick={() => void copy()}>
              <Copy size={17} />
              URLをコピー
            </button>
            {copied && <p role="status">{copied}</p>}
            <p className="mobile-access-note">
              QRコードにはアプリのURLだけが含まれます。ログイン情報や単語帳の内容は含まれません。他の端末で保存した内容は再読み込みで反映します。
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}

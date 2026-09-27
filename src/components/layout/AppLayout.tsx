import type { ReactNode } from 'react';
import { BookOpen, House, Layers2, Settings2, Sprout, Info, UserRound } from 'lucide-react';
import { useAppData } from '../../hooks/useAppData';
import { MobileAccessButton } from '../common/MobileAccess';

function Navigation({
  mobile = false,
  isHome,
  isManaging,
  isSettings,
}: {
  mobile?: boolean;
  isHome: boolean;
  isManaging: boolean;
  isSettings: boolean;
}) {
  return (
    <nav
      aria-label={mobile ? 'モバイルナビゲーション' : 'メインナビゲーション'}
      className={mobile ? 'mobile-nav' : 'sidebar-nav'}
    >
      <a
        href="#/"
        className={`nav-item${!isManaging && !isSettings ? ' active' : ''}`}
        aria-current={isHome ? 'page' : undefined}
      >
        <House size={20} />
        <span>ホーム</span>
      </a>
      <a
        href="#/manage"
        className={`nav-item${isManaging ? ' active' : ''}`}
        aria-current={isManaging ? 'location' : undefined}
      >
        <Layers2 size={20} />
        <span>単語管理</span>
      </a>
      <a
        href="#/settings"
        className={`nav-item${isSettings ? ' active' : ''}`}
        aria-current={isSettings ? 'page' : undefined}
      >
        <Settings2 size={20} />
        <span>設定</span>
      </a>
    </nav>
  );
}

export function AppLayout({
  children,
  isDetail,
  isHome,
  isManaging,
  isSettings = false,
  isStudying = false,
}: {
  children: ReactNode;
  isDetail: boolean;
  isHome: boolean;
  isManaging: boolean;
  isSettings?: boolean;
  isStudying?: boolean;
}) {
  const { isLoading, isSaving, loadError, hasExternalChanges } = useAppData();
  return (
    <div className={`app-shell${isStudying ? ' study-layout' : ''}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        本文へスキップ
      </a>
      <aside className="sidebar">
        <a href="#/" className="brand" aria-label="kotoba ホーム">
          <span className="brand-icon">
            <BookOpen size={22} />
          </span>
          <span>
            kotoba<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-section-label">ワークスペース</div>
        <Navigation isHome={isHome} isManaging={isManaging} isSettings={isSettings} />
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sprout size={23} />
            <p>
              小さな積み重ねが、
              <br />
              確かな知識に。
            </p>
            <span>自分のペースで、続けよう。</span>
          </div>
          <div className="sidebar-caption">
            <span>あなたの、ことばの居場所。</span>
            <span>kotoba</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a href="#/" className="brand mobile-brand" aria-label="kotoba ホーム">
            <span className="brand-icon">
              <BookOpen size={20} />
            </span>
            <span>
              kotoba<span className="brand-dot">.</span>
            </span>
          </a>
          <div className="breadcrumb">
            <span>ワークスペース</span>
            <span className="breadcrumb-slash">/</span>
            <span>
              {isStudying
                ? '学習'
                : isSettings
                  ? '設定'
                  : isManaging
                    ? '単語管理'
                    : isDetail
                      ? '単語帳の詳細'
                      : 'ホーム'}
            </span>
          </div>
          <span className="storage-label">
            <span />
            {isLoading
              ? '読み込み中'
              : loadError
                ? '読み込みエラー'
                : hasExternalChanges
                  ? '更新あり'
                  : isSaving
                    ? '保存中'
                    : 'アカウント保存'}
          </span>
          <MobileAccessButton className="topbar-mobile-access" />
          <a href="#/settings" className="account-link" aria-label="アカウント">
            <UserRound size={18} aria-hidden="true" />
            <span className="account-link-text">アカウント</span>
          </a>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {!loadError && !isStudying && (
            <div className="storage-notice">
              <Info size={16} aria-hidden="true" />
              <p>
                単語帳はログイン中のアカウントに保存します。他の端末で更新した内容は、再読み込みで反映できます。
              </p>
            </div>
          )}
          {children}
          <footer className="page-footer">
            <BookOpen size={14} />
            <span>ひとつ覚える。少し進む。</span>
          </footer>
        </main>
      </div>
      {!isStudying && (
        <Navigation mobile isHome={isHome} isManaging={isManaging} isSettings={isSettings} />
      )}
    </div>
  );
}

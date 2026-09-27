export type AppRoute =
  | { page: 'home' }
  | { page: 'manage' }
  | { page: 'settings' }
  | { page: 'deck'; deckId: string }
  | { page: 'study'; deckId: string }
  | { page: 'words'; deckId: string; folderId?: string }
  | { page: 'word-new'; deckId: string; folderId?: string }
  | { page: 'word-edit'; deckId: string; wordId: string; folderId?: string }
  | { page: 'not-found' };

export function parseRoute(hash: string): AppRoute {
  if (!hash || hash === '#' || hash === '#/') return { page: 'home' };
  if (hash === '#/manage') return { page: 'manage' };
  if (hash === '#/settings') return { page: 'settings' };

  const folderMatch =
    /^#\/decks\/([^/]+)\/folders\/([^/]+)(?:\/words(?:\/(new)|\/([^/]+)\/(edit))?)?$/.exec(hash);
  if (folderMatch) {
    try {
      const deckId = decodeURIComponent(folderMatch[1]);
      const folderId = decodeURIComponent(folderMatch[2]);
      if (folderMatch[3]) return { page: 'word-new', deckId, folderId };
      if (folderMatch[4])
        return { page: 'word-edit', deckId, folderId, wordId: decodeURIComponent(folderMatch[4]) };
      return { page: 'words', deckId, folderId };
    } catch {
      return { page: 'not-found' };
    }
  }

  // URL全体を先に復号すると、ID内の %2F が区切り文字になるため、要素ごとに復号する。
  const studyMatch = /^#\/decks\/([^/]+)\/study$/.exec(hash);
  if (studyMatch) {
    try {
      return { page: 'study', deckId: decodeURIComponent(studyMatch[1]) };
    } catch {
      return { page: 'not-found' };
    }
  }
  const match = /^#\/decks\/([^/]+)(?:\/(words)(?:\/(new)|\/([^/]+)\/(edit))?)?$/.exec(hash);
  if (!match) return { page: 'not-found' };
  try {
    const deckId = decodeURIComponent(match[1]);
    if (!match[2]) return { page: 'deck', deckId };
    if (match[3]) return { page: 'word-new', deckId };
    if (match[4]) return { page: 'word-edit', deckId, wordId: decodeURIComponent(match[4]) };
    return { page: 'words', deckId };
  } catch {
    // 不正なパーセント表記を手入力した場合も、画面全体を停止させない。
    return { page: 'not-found' };
  }
}

export function locationBase(deckId: string, folderId: string | null = null) {
  return `#/decks/${encodeURIComponent(deckId)}${folderId === null ? '' : `/folders/${encodeURIComponent(folderId)}`}`;
}
export function folderHref(deckId: string, folderId: string | null = null) {
  return `${locationBase(deckId, folderId)}${folderId === null ? '/words' : ''}`;
}

const HISTORY_POSITION = 'kotobaNavigationPosition';
type NavigationGuard = () => boolean;
const subscribers = new Set<() => void>();
const guards = new Set<NavigationGuard>();
let started = false;
let acceptedHash = '#/';
let acceptedPosition = 0;
let restoringPosition = false;

function normalizeHash(hash: string) {
  return !hash || hash === '#' ? '#/' : hash;
}

function getPosition(): number | null {
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null || !(HISTORY_POSITION in state)) return null;
  const position = (state as Record<string, unknown>)[HISTORY_POSITION];
  return typeof position === 'number' && Number.isSafeInteger(position) ? position : null;
}

function stateWithPosition(position: number): Record<string, unknown> {
  const state: unknown = window.history.state;
  return {
    ...(typeof state === 'object' && state !== null ? state : {}),
    [HISTORY_POSITION]: position,
  };
}

export function canLeave() {
  for (const guard of guards) {
    if (!guard()) return false;
  }
  return true;
}

function notify() {
  for (const subscriber of subscribers) subscriber();
}

function handleHistoryChange() {
  const nextHash = normalizeHash(window.location.hash);
  let nextPosition = getPosition();

  // キャンセル後に元の履歴へ戻るイベントでは、再確認もReactの画面更新も行わない。
  if (restoringPosition) {
    if (nextPosition === acceptedPosition && nextHash === acceptedHash) restoringPosition = false;
    return;
  }
  if (nextHash === acceptedHash) {
    if (nextPosition !== null) acceptedPosition = nextPosition;
    return;
  }

  // 手入力でハッシュが変わった場合にも、新しい履歴へ位置番号を付ける。
  if (nextPosition === null || nextPosition === acceptedPosition) {
    nextPosition = acceptedPosition + 1;
    window.history.replaceState(stateWithPosition(nextPosition), '');
  }

  if (!canLeave()) {
    // pushStateで穴埋めせず、元の履歴位置へ戻す。戻る・進むの履歴を保持できる。
    restoringPosition = true;
    window.history.go(acceptedPosition - nextPosition);
    return;
  }

  acceptedHash = nextHash;
  acceptedPosition = nextPosition;
  notify();
}

function handleLinkClick(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;

  const destination = new URL(link.href, window.location.href);
  if (destination.protocol !== 'http:' && destination.protocol !== 'https:') return;
  const current = window.location;
  const sameDocument =
    destination.origin === current.origin &&
    destination.pathname === current.pathname &&
    destination.search === current.search;

  if (sameDocument) {
    // リンクはブラウザがURLを書き換える前に確認できるので、キャンセル時に履歴が増えない。
    event.preventDefault();
    navigateToHash(destination.hash);
  } else if (!canLeave()) {
    event.preventDefault();
  }
}

function startNavigation() {
  if (started) return;
  started = true;
  acceptedHash = normalizeHash(window.location.hash);
  acceptedPosition = getPosition() ?? 0;
  window.history.replaceState(stateWithPosition(acceptedPosition), '');
  window.addEventListener('popstate', handleHistoryChange);
  window.addEventListener('hashchange', handleHistoryChange);
  // React側のonClickによるpreventDefaultも尊重するため、バブリング段階で受け取る。
  document.addEventListener('click', handleLinkClick);
}

export function subscribeNavigation(callback: () => void) {
  startNavigation();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function getNavigationSnapshot() {
  // オブジェクトを毎回作らず、承認済みURLの文字列を返す。キャンセル中もフォームを保つ。
  // 初回の描画では読むだけにし、イベント登録と履歴への記録は購読開始時に行う。
  return started ? acceptedHash : normalizeHash(window.location.hash);
}

export function registerNavigationGuard(guard: NavigationGuard) {
  startNavigation();
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

export function navigateToHash(hash: string) {
  startNavigation();
  const nextHash = normalizeHash(hash);
  if (restoringPosition || nextHash === acceptedHash || !canLeave()) return;
  acceptedPosition += 1;
  window.history.pushState(stateWithPosition(acceptedPosition), '', nextHash);
  acceptedHash = nextHash;
  // pushState自身はhashchangeを発生させないため、この場で購読元へ通知する。
  notify();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // 開発中にこのファイルが差し替わっても、古い確認処理を二重登録しない。
    window.removeEventListener('popstate', handleHistoryChange);
    window.removeEventListener('hashchange', handleHistoryChange);
    document.removeEventListener('click', handleLinkClick);
    subscribers.clear();
    guards.clear();
  });
}

import { useSyncExternalStore } from 'react';
import {
  getNavigationSnapshot,
  navigateToHash,
  parseRoute,
  subscribeNavigation,
  folderHref,
} from '../services/navigation';
export type { AppRoute } from '../services/navigation';

export function useNavigation() {
  const hash = useSyncExternalStore(subscribeNavigation, getNavigationSnapshot, () => '#/');
  return {
    route: parseRoute(hash),
    routeKey: hash,
    navigateHome: () => navigateToHash('#/'),
    navigateManage: () => navigateToHash('#/manage'),
    navigateDeck: (deckId: string) => navigateToHash(`#/decks/${encodeURIComponent(deckId)}`),
    navigateStudy: (deckId: string) =>
      navigateToHash(`#/decks/${encodeURIComponent(deckId)}/study`),
    navigateWords: (deckId: string, folderId: string | null = null) =>
      navigateToHash(folderHref(deckId, folderId)),
    navigateNewWord: (deckId: string) =>
      navigateToHash(`#/decks/${encodeURIComponent(deckId)}/words/new`),
    navigateEditWord: (deckId: string, wordId: string) =>
      navigateToHash(
        `#/decks/${encodeURIComponent(deckId)}/words/${encodeURIComponent(wordId)}/edit`,
      ),
  };
}

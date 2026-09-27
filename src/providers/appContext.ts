import { createContext } from 'react';
import type {
  AppData,
  AppSettings,
  Deck,
  Folder,
  EntityId,
  Word,
  WordInput,
  StudyFormat,
  StudyMode,
  StudyRating,
  StudySession,
} from '../types/domain';
import type { DataError, Result } from '../types/storage';
import type { ImportOutcome } from '../services/wordImportService';

export interface AppContextValue {
  data: AppData;
  isLoading: boolean;
  isSaving: boolean;
  loadError: DataError | null;
  recoveryData: string | null;
  hasExternalChanges: boolean;
  retryLoad(): void;
  resetStorage(original: string): Promise<Result<void>>;
  createDeck(name: string): Promise<Result<Deck>>;
  renameDeck(id: EntityId, name: string): Promise<Result<Deck>>;
  deleteDeck(id: EntityId): Promise<Result<void>>;
  createFolder(deckId: EntityId, parentId: EntityId | null, name: string): Promise<Result<Folder>>;
  renameFolder(deckId: EntityId, folderId: EntityId, name: string): Promise<Result<Folder>>;
  deleteFolder(deckId: EntityId, folderId: EntityId): Promise<Result<void>>;
  moveWord(deckId: EntityId, wordId: EntityId, folderId: EntityId | null): Promise<Result<Word>>;
  createWord(deckId: EntityId, input: WordInput, folderId?: EntityId | null): Promise<Result<Word>>;
  updateWord(deckId: EntityId, wordId: EntityId, input: WordInput): Promise<Result<Word>>;
  deleteWord(deckId: EntityId, wordId: EntityId): Promise<Result<void>>;
  importWords(
    deckId: EntityId,
    inputs: WordInput[],
    skipDuplicates: boolean,
    expectedRevision: number,
    folderId?: EntityId | null,
  ): Promise<Result<ImportOutcome>>;
  startStudy(
    deckId: EntityId,
    mode: StudyMode,
    expectedSessionId: EntityId | null,
    replaceUnfinished?: boolean,
    folderId?: EntityId | null,
    scopeWordIds?: EntityId[],
    format?: StudyFormat,
    targetWordIds?: EntityId[],
  ): Promise<Result<StudySession>>;
  rateStudy(
    sessionId: EntityId,
    wordId: EntityId,
    rating: StudyRating,
  ): Promise<Result<StudySession>>;
  closeStudy(sessionId: EntityId): Promise<Result<void>>;
  setSwipeEnabled(enabled: boolean): Promise<Result<void>>;
  saveSettings(settings: AppSettings): Promise<Result<void>>;
}

export const AppContext = createContext<AppContextValue | null>(null);

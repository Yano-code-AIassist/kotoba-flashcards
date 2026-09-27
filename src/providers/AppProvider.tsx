import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AppData,
  AppSettings,
  EntityId,
  WordInput,
  StudyFormat,
  StudyMode,
  StudyRating,
} from '../types/domain';
import type { DataError, Result } from '../types/storage';
import { createInitialAppData } from '../services/appRepository';
import type { AppRepository } from '../services/appRepository';
import { createLocalStorageRepository } from '../services/localStorageRepository';
import { createDeckInData, deleteDeckFromData, renameDeckInData } from '../services/deckService';
import type { DataChange } from '../services/deckService';
import { createWordInData, deleteWordFromData, updateWordInData } from '../services/wordService';
import { AppContext } from './appContext';
import { startStudyInData, rateStudyInData, closeStudyInData } from '../services/studyService';
import { saveSettingsInData, setSwipeEnabledInData } from '../services/settingsService';
import { importWordsInData } from '../services/wordImportService';
import {
  createFolderInData,
  renameFolderInData,
  deleteFolderFromData,
  moveWordInData,
} from '../services/folderService';

interface AppProviderProps {
  children: ReactNode;
  repository?: AppRepository;
}

export function AppProvider({ children, repository }: AppProviderProps) {
  const [localRepository] = useState(createLocalStorageRepository);
  const activeRepository = repository ?? localRepository;
  const [previousRepository, setPreviousRepository] = useState(activeRepository);
  const [data, setData] = useState(createInitialAppData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<DataError | null>(null);
  const [recoveryData, setRecoveryData] = useState<string | null>(null);
  const [hasExternalChanges, setHasExternalChanges] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const externalChangeRef = useRef(false);
  const dataRef = useRef(data);
  const readyRepositoryRef = useRef<AppRepository | null>(null);
  const pendingRef = useRef(false);
  const generationRef = useRef(0);

  if (previousRepository !== activeRepository) {
    // 保存先が変わった時だけ表示状態をリセットし、旧データを一瞬表示することを防ぐ。
    // effectでは外部データの読み込みを行い、完了した結果だけを反映する。
    setPreviousRepository(activeRepository);
    setData(createInitialAppData());
    setIsLoading(true);
    setIsSaving(false);
    setLoadError(null);
    setRecoveryData(null);
    setHasExternalChanges(false);
  }

  const retryLoad = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    setRecoveryData(null);
    setHasExternalChanges(false);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    readyRepositoryRef.current = null;
    pendingRef.current = false;
    externalChangeRef.current = false;
    const unsubscribe = activeRepository.subscribe?.(() => {
      if (generation !== generationRef.current) return;
      externalChangeRef.current = true;
      setHasExternalChanges(true);
    });
    async function loadData() {
      try {
        const result = await activeRepository.load();
        if (generation !== generationRef.current) return;
        if (!result.ok) {
          setLoadError(result.error);
          const original = activeRepository.recovery?.getOriginal();
          setRecoveryData(original?.ok ? original.value : null);
          return;
        }
        const loadedData = result.value ?? createInitialAppData();
        dataRef.current = loadedData;
        readyRepositoryRef.current = activeRepository;
        setData(loadedData);
      } catch {
        if (generation === generationRef.current) {
          setLoadError({
            code: 'unavailable',
            message: 'データを読み込めませんでした。もう一度お試しください。',
          });
        }
      } finally {
        if (generation === generationRef.current) setIsLoading(false);
      }
    }

    void loadData();
    return () => {
      // StrictModeの再実行やアンマウント後に、古い読み込み結果を反映させない。
      generationRef.current += 1;
      readyRepositoryRef.current = null;
      unsubscribe?.();
    };
  }, [activeRepository, loadAttempt]);

  const resetStorage = useCallback(
    async (original: string): Promise<Result<void>> => {
      if (!activeRepository.recovery || pendingRef.current) {
        return {
          ok: false,
          error: {
            code: 'busy',
            message: '現在は初期化できません。少し待ってからお試しください。',
          },
        };
      }
      pendingRef.current = true;
      setIsSaving(true);
      try {
        const result = await activeRepository.recovery.reset(original);
        if (result.ok) retryLoad();
        return result;
      } catch {
        return {
          ok: false,
          error: {
            code: 'write-failed',
            message: '初期化できませんでした。もう一度お試しください。',
          },
        };
      } finally {
        pendingRef.current = false;
        setIsSaving(false);
      }
    },
    [activeRepository, retryLoad],
  );

  const applyChange = useCallback(
    async <T,>(change: (current: AppData) => Result<DataChange<T>>): Promise<Result<T>> => {
      if (externalChangeRef.current) {
        return {
          ok: false,
          error: {
            code: 'conflict',
            message:
              '別のタブなどで保存データが変わりました。入力を控えてから、ページを再読み込みしてください。',
          },
        };
      }
      if (readyRepositoryRef.current !== activeRepository) {
        return {
          ok: false,
          error: { code: 'unavailable', message: 'データの読み込みが完了していません。' },
        };
      }
      if (pendingRef.current) {
        return {
          ok: false,
          error: { code: 'busy', message: '保存中です。少し待ってから操作してください。' },
        };
      }

      const generation = generationRef.current;
      // state更新が描画に反映される前の連打も、同期的なrefで防ぐ。
      pendingRef.current = true;
      setIsSaving(true);
      try {
        const current = dataRef.current;
        const next = change(current);
        if (!next.ok) {
          return next;
        }
        const result = await activeRepository.save(next.value.data, current.revision);
        if (generation !== generationRef.current) {
          return {
            ok: false,
            error: {
              code: 'unavailable',
              message: '画面が切り替わったため操作結果を確認できませんでした。',
            },
          };
        }
        if (!result.ok) {
          if (['conflict', 'corrupted', 'unsupported-version'].includes(result.error.code)) {
            externalChangeRef.current = true;
            setHasExternalChanges(true);
          }
          return result;
        }
        // 保存成功後だけ表示状態を進め、失敗時は前のデータを維持する。
        dataRef.current = result.value;
        setData(result.value);
        return { ok: true, value: next.value.value };
      } catch {
        const message = '保存できませんでした。もう一度お試しください。';
        return { ok: false, error: { code: 'write-failed', message } };
      } finally {
        if (generation === generationRef.current) {
          pendingRef.current = false;
          setIsSaving(false);
        }
      }
    },
    [activeRepository],
  );

  const createDeck = useCallback(
    (name: string) => applyChange((current) => createDeckInData(current, name)),
    [applyChange],
  );
  const renameDeck = useCallback(
    (id: EntityId, name: string) => applyChange((current) => renameDeckInData(current, id, name)),
    [applyChange],
  );
  const deleteDeck = useCallback(
    (id: EntityId) => applyChange((current) => deleteDeckFromData(current, id)),
    [applyChange],
  );
  const createWord = useCallback(
    (deckId: EntityId, input: WordInput, folderId: EntityId | null = null) =>
      applyChange((current) => createWordInData(current, deckId, input, folderId)),
    [applyChange],
  );
  const updateWord = useCallback(
    (deckId: EntityId, wordId: EntityId, input: WordInput) =>
      applyChange((current) => updateWordInData(current, deckId, wordId, input)),
    [applyChange],
  );
  const deleteWord = useCallback(
    (deckId: EntityId, wordId: EntityId) =>
      applyChange((current) => deleteWordFromData(current, deckId, wordId)),
    [applyChange],
  );
  const startStudy = useCallback(
    (
      deckId: EntityId,
      mode: StudyMode,
      expectedSessionId: EntityId | null,
      replaceUnfinished = false,
      folderId: EntityId | null = null,
      scopeWordIds?: EntityId[],
      format: StudyFormat = 'flashcard',
      targetWordIds?: EntityId[],
    ) =>
      applyChange((current) =>
        startStudyInData(
          current,
          deckId,
          mode,
          expectedSessionId,
          replaceUnfinished,
          folderId,
          scopeWordIds,
          format,
          targetWordIds,
        ),
      ),
    [applyChange],
  );
  const importWords = useCallback(
    (
      deckId: EntityId,
      inputs: WordInput[],
      skipDuplicates: boolean,
      expectedRevision: number,
      folderId: EntityId | null = null,
    ) =>
      applyChange((current) =>
        importWordsInData(current, deckId, inputs, skipDuplicates, expectedRevision, folderId),
      ),
    [applyChange],
  );
  const rateStudy = useCallback(
    (sessionId: EntityId, wordId: EntityId, rating: StudyRating) =>
      applyChange((current) => rateStudyInData(current, sessionId, wordId, rating)),
    [applyChange],
  );
  const closeStudy = useCallback(
    (sessionId: EntityId) => applyChange((current) => closeStudyInData(current, sessionId)),
    [applyChange],
  );
  const setSwipeEnabled = useCallback(
    (enabled: boolean) => applyChange((current) => setSwipeEnabledInData(current, enabled)),
    [applyChange],
  );
  const saveSettings = useCallback(
    (settings: AppSettings) => applyChange((current) => saveSettingsInData(current, settings)),
    [applyChange],
  );
  const value = useMemo(
    () => ({
      data,
      isLoading,
      isSaving,
      loadError,
      recoveryData,
      hasExternalChanges,
      retryLoad,
      resetStorage,
      createDeck,
      renameDeck,
      deleteDeck,
      createFolder: (deckId: EntityId, parentId: EntityId | null, name: string) =>
        applyChange((current) => createFolderInData(current, deckId, parentId, name)),
      renameFolder: (deckId: EntityId, folderId: EntityId, name: string) =>
        applyChange((current) => renameFolderInData(current, deckId, folderId, name)),
      deleteFolder: (deckId: EntityId, folderId: EntityId) =>
        applyChange((current) => deleteFolderFromData(current, deckId, folderId)),
      moveWord: (deckId: EntityId, wordId: EntityId, folderId: EntityId | null) =>
        applyChange((current) => moveWordInData(current, deckId, wordId, folderId)),
      createWord,
      updateWord,
      deleteWord,
      importWords,
      startStudy,
      rateStudy,
      closeStudy,
      setSwipeEnabled,
      saveSettings,
    }),
    [
      applyChange,
      data,
      isLoading,
      isSaving,
      loadError,
      recoveryData,
      hasExternalChanges,
      retryLoad,
      resetStorage,
      createDeck,
      renameDeck,
      deleteDeck,
      createWord,
      updateWord,
      deleteWord,
      importWords,
      startStudy,
      rateStudy,
      closeStudy,
      setSwipeEnabled,
      saveSettings,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

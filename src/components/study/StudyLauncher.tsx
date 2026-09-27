import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Play, RotateCcw } from 'lucide-react';
import type { Deck, StudyFormat, StudyMode } from '../../types/domain';
import { useAppData } from '../../hooks/useAppData';
import { useNavigation } from '../../hooks/useNavigation';
import {
  getDistinctAnswerCount,
  getStudyCandidates,
  STUDY_FORMATS,
  STUDY_MODES,
} from '../../services/studyService';
import { Dialog } from '../common/Dialog';
import { ErrorNotice } from '../common/ErrorNotice';
import { folderPath, wordsInFolder } from '../../services/folderService';

export function StudyLauncher({ deck, folderId = null }: { deck: Deck; folderId?: string | null }) {
  const { data, isSaving, hasExternalChanges, startStudy } = useAppData();
  const { navigateStudy } = useNavigation();
  const [mode, setMode] = useState<StudyMode>(data.settings.defaultStudyMode);
  const [format, setFormat] = useState<StudyFormat>('flashcard');
  const [error, setError] = useState<string | null>(null);
  const childFolders = useMemo(
    () =>
      data.folders
        .filter((folder) => folder.deckId === deck.id && folder.parentId === folderId)
        .sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id),
        ),
    [data.folders, deck.id, folderId],
  );
  const childFolderIds = useMemo(() => childFolders.map((folder) => folder.id), [childFolders]);
  const [includeDirectWords, setIncludeDirectWords] = useState(true);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(childFolderIds);
  const previousChildIds = useRef(new Set(childFolderIds));
  const [replacement, setReplacement] = useState<{
    sessionId: string;
    mode: StudyMode;
    format: StudyFormat;
    scopeWordIds: string[];
  } | null>(null);
  const submitting = useRef(false);
  const session = data.activeSession;
  const unfinished = session !== null && session.answers.length < session.wordIds.length;
  const sessionDeck = data.decks.find((item) => item.id === session?.deckId);
  useEffect(() => {
    const previous = previousChildIds.current;
    setSelectedFolderIds((current) => {
      const selected = new Set(current);
      const next = childFolderIds.filter((id) => selected.has(id) || !previous.has(id));
      return next.length === current.length && next.every((id, index) => id === current[index])
        ? current
        : next;
    });
    previousChildIds.current = new Set(childFolderIds);
  }, [childFolderIds]);
  const directWords = wordsInFolder(data, deck.id, folderId);
  const selectedFolders = new Set(selectedFolderIds.filter((id) => childFolderIds.includes(id)));
  const scopedWords = [
    ...(includeDirectWords ? directWords : []),
    ...childFolders
      .filter((folder) => selectedFolders.has(folder.id))
      .flatMap((folder) => wordsInFolder(data, deck.id, folder.id, true)),
  ];
  const scopeWordIds = scopedWords.map((word) => word.id);
  const candidateCount = getStudyCandidates(scopedWords, deck.id, mode).length;
  const distinctAnswerCount = getDistinctAnswerCount(scopedWords);
  const choiceUnavailable = format === 'multiple-choice' && distinctAnswerCount < 4;
  const blocked = isSaving || hasExternalChanges;
  const allScopesSelected =
    childFolders.every((folder) => selectedFolders.has(folder.id)) &&
    (directWords.length === 0 || includeDirectWords);

  async function begin(
    selectedMode: StudyMode,
    selectedFormat: StudyFormat,
    previousId: string | null,
    selectedWordIds: string[],
    replace = false,
  ) {
    if (submitting.current || blocked) return;
    submitting.current = true;
    setError(null);
    try {
      const result = await startStudy(
        deck.id,
        selectedMode,
        previousId,
        replace,
        folderId,
        selectedWordIds,
        selectedFormat,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setReplacement(null);
      navigateStudy(deck.id);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <section className="study-launcher" aria-labelledby="study-launcher-heading">
      <div className="study-section-heading">
        <span className="eyebrow">STUDY TEST</span>
        <h2 id="study-launcher-heading">保存した単語で学習テスト</h2>
        <p>カード式または4択問題で、保存した単語をテストできます。</p>
      </div>
      {session && sessionDeck && (session.deckId === deck.id || unfinished) && (
        <div className="study-resume">
          <RotateCcw size={21} aria-hidden="true" />
          <div>
            <h3>{unfinished ? '学習の続きがあります' : '前回の学習結果'}</h3>
            <p>
              {[
                sessionDeck.name,
                ...folderPath(data.folders, session.folderId ?? null).map((folder) => folder.name),
              ].join(' / ')}{' '}
              · {session.answers.length} / {session.wordIds.length} 問を回答済み
            </p>
          </div>
          <a
            className="button button-secondary"
            href={`#/decks/${encodeURIComponent(session.deckId)}/study`}
          >
            {unfinished ? '続きから学習' : '結果を見る'}
            <ArrowRight size={16} />
          </a>
        </div>
      )}
      {childFolders.length > 0 && (
        <fieldset className="study-scope" disabled={blocked}>
          <legend>出題範囲</legend>
          <div className="study-scope-heading">
            <p>複数選択できます。子フォルダーは下の階層も含みます。</p>
            <div>
              <button
                type="button"
                className="text-button"
                disabled={allScopesSelected}
                onClick={() => {
                  setIncludeDirectWords(true);
                  setSelectedFolderIds(childFolderIds);
                  setError(null);
                }}
              >
                すべて選択
              </button>
              <button
                type="button"
                className="text-button"
                disabled={!includeDirectWords && selectedFolders.size === 0}
                onClick={() => {
                  setIncludeDirectWords(false);
                  setSelectedFolderIds([]);
                  setError(null);
                }}
              >
                選択解除
              </button>
            </div>
          </div>
          <div className="study-scope-options">
            {directWords.length > 0 && (
              <label className={includeDirectWords ? 'selected' : ''}>
                <input
                  type="checkbox"
                  checked={includeDirectWords}
                  onChange={(event) => {
                    setIncludeDirectWords(event.target.checked);
                    setError(null);
                  }}
                />
                <span>
                  <strong>{folderId ? 'このフォルダー直下' : '単語帳直下'}</strong>
                  <small>
                    {folderId
                      ? '子フォルダーには入っていない単語'
                      : 'どのフォルダーにも入っていない単語'}
                  </small>
                </span>
                <b>{directWords.length}語</b>
              </label>
            )}
            {childFolders.map((folder) => {
              const count = wordsInFolder(data, deck.id, folder.id, true).length;
              const checked = selectedFolders.has(folder.id);
              return (
                <label key={folder.id} className={checked ? 'selected' : ''}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setSelectedFolderIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, folder.id])]
                          : current.filter((id) => id !== folder.id),
                      );
                      setError(null);
                    }}
                  />
                  <span>
                    <strong>{folder.name}</strong>
                    <small>このフォルダーと下の階層</small>
                  </span>
                  <b>{count}語</b>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <fieldset className="study-modes study-formats" disabled={blocked}>
        <legend>出題形式</legend>
        {STUDY_FORMATS.map((item) => (
          <label
            className={`study-mode${format === item.value ? ' selected' : ''}`}
            key={item.value}
          >
            <input
              type="radio"
              name={`study-format-${deck.id}`}
              value={item.value}
              checked={format === item.value}
              onChange={() => {
                setFormat(item.value);
                setError(null);
              }}
            />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="study-modes" disabled={blocked}>
        <legend>出題対象・順番</legend>
        {STUDY_MODES.map((item) => (
          <label className={`study-mode${mode === item.value ? ' selected' : ''}`} key={item.value}>
            <input
              type="radio"
              name={`study-mode-${deck.id}`}
              value={item.value}
              checked={mode === item.value}
              onChange={() => {
                setMode(item.value);
                setError(null);
              }}
            />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
            <span className="study-mode-count">
              {getStudyCandidates(scopedWords, deck.id, item.value).length}
              <small>語</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="study-start-row">
        <p aria-live="polite">
          {candidateCount === 0
            ? '対象の単語がありません。別の方法を選ぶか、単語を追加してください。'
            : choiceUnavailable
              ? `4択問題には異なる答えが4つ必要です。現在は${distinctAnswerCount}つです。`
              : candidateCount === 1
                ? '対象は1語です。再学習でも同じ単語が出ます。'
                : `${candidateCount}語を1回ずつ出題します。途中で戻っても再開できます。`}
        </p>
        <button
          className="button button-primary"
          disabled={blocked || candidateCount === 0 || choiceUnavailable}
          onClick={() => {
            if (unfinished && session) {
              setError(null);
              setReplacement({
                sessionId: session.id,
                mode,
                format,
                scopeWordIds: [...scopeWordIds],
              });
            } else void begin(mode, format, session?.id ?? null, scopeWordIds);
          }}
        >
          <Play size={18} />
          {isSaving ? '保存中…' : '学習テストを始める'}
        </button>
      </div>
      {error && !replacement && <ErrorNotice message={error} />}
      {replacement && (
        <Dialog
          title="新しい学習を始めますか？"
          description={`「${sessionDeck?.name ?? '単語帳'}」の途中の学習を終了して、新しく始めます。回答済みの単語の学習状態は残ります。`}
          busy={isSaving}
          onClose={() => setReplacement(null)}
        >
          <p className="dialog-description">
            続けたい場合はキャンセルして「続きから学習」を選んでください。
          </p>
          {hasExternalChanges && (
            <p className="inline-error" role="alert">
              別のタブで保存データが変わりました。閉じてページを再読み込みしてください。
            </p>
          )}
          {error && <ErrorNotice message={error} />}
          <div className="dialog-actions">
            <button
              className="button button-secondary"
              data-initial-focus
              disabled={isSaving}
              onClick={() => setReplacement(null)}
            >
              キャンセル
            </button>
            <button
              className="button button-primary"
              disabled={blocked}
              onClick={() =>
                void begin(
                  replacement.mode,
                  replacement.format,
                  replacement.sessionId,
                  replacement.scopeWordIds,
                  true,
                )
              }
            >
              新しく始める
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

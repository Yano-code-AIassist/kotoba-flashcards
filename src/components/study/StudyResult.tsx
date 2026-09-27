import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CircleCheck, RotateCcw } from 'lucide-react';
import type { Deck, StudySession } from '../../types/domain';
import { useAppData } from '../../hooks/useAppData';
import { useNavigation } from '../../hooks/useNavigation';
import { getStudyCandidates } from '../../services/studyService';
import { ErrorNotice } from '../common/ErrorNotice';
import { folderPath } from '../../services/folderService';

export function StudyResult({ deck, session }: { deck: Deck; session: StudySession }) {
  const { data, isSaving, hasExternalChanges, startStudy, closeStudy } = useAppData();
  const { navigateDeck, navigateWords } = useNavigation();
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const remembered = session.answers.filter((answer) => answer.rating === 'remembered').length;
  const learning = session.answers.length - remembered;
  const scopeWordIds = session.scopeWordIds ?? session.wordIds;
  const retryWordIds = getStudyCandidates(
    data.words.filter((word) => session.wordIds.includes(word.id)),
    deck.id,
    'learning',
  ).map((word) => word.id);
  const retryCount = retryWordIds.length;
  const scopeName = session.folderId ? 'このフォルダー以下' : '単語帳';
  const blocked = isSaving || hasExternalChanges;
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);

  async function finish(retry: boolean) {
    if (pending.current || blocked) return;
    pending.current = true;
    setError(null);
    try {
      const result = retry
        ? await startStudy(
            deck.id,
            'learning',
            session.id,
            false,
            session.folderId ?? null,
            scopeWordIds,
            session.format ?? 'flashcard',
            retryWordIds,
          )
        : await closeStudy(session.id);
      if (!result.ok) setError(result.error.message);
      else if (!retry) {
        if (session.folderId) navigateWords(deck.id, session.folderId);
        else navigateDeck(deck.id);
      }
    } finally {
      pending.current = false;
    }
  }

  return (
    <section className="study-result">
      <span className="study-complete-icon">
        <CircleCheck size={38} strokeWidth={1.5} />
      </span>
      <p className="eyebrow">SESSION COMPLETE</p>
      <h1 ref={headingRef} tabIndex={-1}>
        おつかれさまでした
      </h1>
      <p className="study-result-deck">
        {[
          deck.name,
          ...folderPath(data.folders, session.folderId ?? null).map((folder) => folder.name),
        ].join(' / ')}
      </p>
      <p className="study-result-total">
        {session.wordIds.length}語の学習を終えました。回答は保存済みです。
      </p>
      <div className="study-result-counts">
        <div>
          <span>
            <Check size={19} />
            覚えた
          </span>
          <strong>
            {remembered}
            <small>語</small>
          </strong>
        </div>
        <div>
          <span>
            <RotateCcw size={18} />
            まだ
          </span>
          <strong>
            {learning}
            <small>語</small>
          </strong>
        </div>
      </div>
      <p className="study-result-hint">
        今回の回答を集計しています。単語帳全体の進捗は詳細画面で確認できます。
      </p>
      <div className="study-result-next">
        <h2>もうひと押し、してみよう</h2>
        <p>
          {retryCount === 0
            ? `${scopeName}に「まだ」の単語はありません。`
            : `${scopeName}の「まだ」${retryCount}語を、もう一度学習できます。`}
        </p>
        {retryCount === 1 && <p>対象は1語です。再学習でも同じ単語が出ます。</p>}
        <button
          className="button button-primary"
          disabled={blocked || retryCount === 0}
          onClick={() => void finish(true)}
        >
          <RotateCcw size={18} />
          「まだ」をもう一度
        </button>
        <button
          className="button button-secondary"
          disabled={blocked}
          onClick={() => void finish(false)}
        >
          <ArrowLeft size={17} />
          結果を閉じて{session.folderId ? 'フォルダー' : '単語帳'}に戻る
        </button>
      </div>
      {error && <ErrorNotice message={error} />}
    </section>
  );
}

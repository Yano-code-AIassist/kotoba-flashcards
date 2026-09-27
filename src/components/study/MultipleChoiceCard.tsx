import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, CircleCheck, CircleX, Lightbulb, LoaderCircle } from 'lucide-react';
import type { StudyRating, Word } from '../../types/domain';
import { getMultipleChoiceOptions } from '../../services/studyService';

export function MultipleChoiceCard({
  word,
  poolWords,
  busy,
  blocked,
  isLast,
  onSubmit,
}: {
  word: Word;
  poolWords: Word[];
  busy: boolean;
  blocked: boolean;
  isLast: boolean;
  onSubmit: (rating: StudyRating) => void;
}) {
  const groupName = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const options = getMultipleChoiceOptions(poolWords, word.id);
  const correct = selected === word.answer;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <section className="multiple-choice-card" aria-labelledby={`${groupName}-question`}>
      <span className="multiple-choice-label">QUESTION</span>
      <h2 id={`${groupName}-question`} ref={headingRef} tabIndex={-1}>
        {word.question}
      </h2>
      <fieldset className="multiple-choice-options" disabled={busy || blocked || selected !== null}>
        <legend>正しい答えを1つ選んでください</legend>
        {options.map((option, index) => {
          const isCorrectOption = option === word.answer;
          const isSelectedOption = option === selected;
          const resultClass =
            selected === null
              ? ''
              : isCorrectOption
                ? ' correct'
                : isSelectedOption
                  ? ' wrong'
                  : '';
          return (
            <label className={`multiple-choice-option${resultClass}`} key={option}>
              <input
                type="radio"
                name={groupName}
                value={option}
                checked={isSelectedOption}
                onChange={() => setSelected(option)}
              />
              <span className="multiple-choice-number">{index + 1}</span>
              <span>{option}</span>
              {selected !== null && isCorrectOption && <CircleCheck size={21} aria-label="正解" />}
              {selected !== null && isSelectedOption && !isCorrectOption && (
                <CircleX size={21} aria-label="不正解" />
              )}
            </label>
          );
        })}
      </fieldset>
      {selected !== null && (
        <div className={`multiple-choice-feedback ${correct ? 'correct' : 'wrong'}`} role="status">
          <strong>{correct ? '正解です' : '不正解です'}</strong>
          {!correct && (
            <p>
              正解：<span>{word.answer}</span>
            </p>
          )}
          {word.note && (
            <p className="multiple-choice-note">
              <Lightbulb size={17} aria-hidden="true" />
              <span>{word.note}</span>
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="button button-primary multiple-choice-next"
        disabled={selected === null || busy || blocked}
        onClick={() => onSubmit(correct ? 'remembered' : 'learning')}
      >
        {busy ? <LoaderCircle className="spin" size={20} /> : <ArrowRight size={19} />}
        {busy ? '保存中…' : isLast ? '結果を見る' : '次の問題へ'}
      </button>
      <p className="study-save-hint">
        正解は「覚えた」、不正解は「まだ」として、次へ進むと保存します。
      </p>
    </section>
  );
}

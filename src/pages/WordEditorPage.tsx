import { ArrowLeft, BookOpen } from 'lucide-react';
import { WordForm } from '../components/editor/WordForm';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAppData } from '../hooks/useAppData';
import { useNavigation } from '../hooks/useNavigation';
import type { Deck, Word } from '../types/domain';
import { folderHref } from '../services/navigation';
import { FolderBreadcrumbs } from '../components/folders/FolderBreadcrumbs';

interface WordEditorPageProps {
  deck: Deck;
  word?: Word;
  folderId?: string | null;
  onNotice: (message: string) => void;
}

export function WordEditorPage({ deck, word, folderId = null, onNotice }: WordEditorPageProps) {
  const { data, createWord, updateWord, deleteWord, isSaving, hasExternalChanges } = useAppData();
  const { navigateWords } = useNavigation();
  return (
    <div className="word-editor-page">
      <a className="back-link" href={folderHref(deck.id, folderId)}>
        <ArrowLeft size={17} />
        単語一覧に戻る
      </a>
      <FolderBreadcrumbs deck={deck} folderId={folderId} />
      <div className="editor-page-heading">
        <div>
          <p className="eyebrow">{word ? 'EDIT YOUR WORD' : 'A NEW LITTLE STEP'}</p>
          <h1>{word ? '単語を編集' : '単語を追加'}</h1>
          <p className="editor-deck-name">
            <BookOpen size={15} />
            <span>{deck.name}</span>
          </p>
        </div>
        {word && <StatusBadge status={word.status} />}
      </div>
      <WordForm
        draftScope={`word-form:${deck.id}:${word?.id ?? `new:${folderId ?? 'root'}`}`}
        word={word}
        busy={isSaving}
        conflicted={hasExternalChanges}
        onSave={(input) =>
          word ? updateWord(deck.id, word.id, input) : createWord(deck.id, input, folderId)
        }
        onSaved={(savedWord) => {
          navigateWords(deck.id, folderId);
          const ended =
            word &&
            (data.activeSession?.wordIds.includes(word.id) ||
              data.activeSession?.scopeWordIds?.includes(word.id)) &&
            (word.question !== savedWord.question ||
              word.answer !== savedWord.answer ||
              word.note !== savedWord.note);
          onNotice(
            ended
              ? '単語を変更しました。前の学習は終了しました。単語帳から新しく学習できます。'
              : word
                ? '単語を変更しました。'
                : '単語を追加しました。',
          );
        }}
        onCancel={() => navigateWords(deck.id, folderId)}
        onDelete={() =>
          word
            ? deleteWord(deck.id, word.id)
            : Promise.resolve({
                ok: false,
                error: { code: 'not-found', message: '単語が見つかりません。' },
              })
        }
        onDeleted={() => {
          navigateWords(deck.id, folderId);
          onNotice(
            word &&
              (data.activeSession?.wordIds.includes(word.id) ||
                data.activeSession?.scopeWordIds?.includes(word.id))
              ? '単語を削除しました。前の学習は終了しました。単語帳から新しく学習できます。'
              : '単語を削除しました。',
          );
        }}
      />
    </div>
  );
}

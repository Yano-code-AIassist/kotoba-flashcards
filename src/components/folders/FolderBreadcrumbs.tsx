import { ChevronRight, BookOpen } from 'lucide-react';
import type { Deck } from '../../types/domain';
import { useAppData } from '../../hooks/useAppData';
import { folderPath } from '../../services/folderService';
import { folderHref } from '../../services/navigation';

export function FolderBreadcrumbs({ deck, folderId }: { deck: Deck; folderId: string | null }) {
  const { data } = useAppData();
  return (
    <nav className="folder-breadcrumbs" aria-label="フォルダーの場所">
      <a href={`#/decks/${encodeURIComponent(deck.id)}`}>
        <BookOpen size={16} />
        {deck.name}
      </a>
      {folderPath(data.folders, folderId).map((folder) => (
        <span key={folder.id}>
          <ChevronRight size={14} aria-hidden="true" />
          <a
            href={folderHref(deck.id, folder.id)}
            aria-current={folder.id === folderId ? 'location' : undefined}
          >
            {folder.name}
          </a>
        </span>
      ))}
      {folderId === null && (
        <span>
          <ChevronRight size={14} aria-hidden="true" />
          <a href={folderHref(deck.id)}>単語帳の直下</a>
        </span>
      )}
    </nav>
  );
}

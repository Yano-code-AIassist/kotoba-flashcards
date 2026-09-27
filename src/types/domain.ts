export type EntityId = string;
export type ISODateString = string;

export type LearningStatus = 'unlearned' | 'remembered' | 'learning';
export type StudyMode = 'all' | 'unlearned' | 'learning' | 'random';
export type StudyFormat = 'flashcard' | 'multiple-choice';
export type StudyRating = Exclude<LearningStatus, 'unlearned'>;

export interface Deck {
  id: EntityId;
  name: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Folder {
  id: EntityId;
  deckId: EntityId;
  parentId: EntityId | null;
  name: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Word {
  id: EntityId;
  // 名前ではなくIDで関連付けると、単語帳の改名で所属が壊れない。
  deckId: EntityId;
  // 未指定/nullは単語帳の直下。旧データの単語も直下として扱う。
  folderId?: EntityId | null;
  question: string;
  answer: string;
  note: string;
  status: LearningStatus;
  lastStudiedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type WordInput = Pick<Word, 'question' | 'answer' | 'note'>;

export interface AppSettings {
  defaultStudyMode: StudyMode;
  swipeEnabled: boolean;
}

export interface StudyAnswer {
  wordId: EntityId;
  rating: StudyRating;
  answeredAt: ISODateString;
}

export interface StudySession {
  id: EntityId;
  deckId: EntityId;
  folderId?: EntityId | null;
  mode: StudyMode;
  // 未指定の旧データは従来のカード式として扱う。
  format?: StudyFormat;
  // 4択の誤答候補と再テストに、開始時に選んだ範囲をそのまま使う。
  scopeWordIds?: EntityId[];
  // 再開しても出題順が変わらないよう、開始時のID順を保持する。
  wordIds: EntityId[];
  answers: StudyAnswer[];
  startedAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AppData {
  version: 2;
  revision: number;
  decks: Deck[];
  folders: Folder[];
  words: Word[];
  settings: AppSettings;
  activeSession: StudySession | null;
}

// 件数は単語から算出し、保存データと表示のずれを防ぐ。
export interface DeckProgress {
  total: number;
  unlearned: number;
  learning: number;
  remembered: number;
  percent: number;
}

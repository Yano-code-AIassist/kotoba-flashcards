import type { AppData, Deck, EntityId } from '../types/domain';
import type { Result } from '../types/storage';
import { createId } from '../utils/createId';

export const MAX_DECK_NAME_LENGTH = 80;

export interface DataChange<T> {
  data: AppData;
  value: T;
}

export function validateDeckName(input: string): Result<string> {
  const name = input.trim();
  if (!name) {
    return {
      ok: false,
      error: { code: 'validation', message: '単語帳の名前を入力してください。' },
    };
  }
  if (name.length > MAX_DECK_NAME_LENGTH) {
    return {
      ok: false,
      error: {
        code: 'validation',
        message: `名前は${MAX_DECK_NAME_LENGTH}文字以内で入力してください。`,
      },
    };
  }
  return { ok: true, value: name };
}

export function createDeckInData(data: AppData, input: string): Result<DataChange<Deck>> {
  const name = validateDeckName(input);
  if (!name.ok) return name;
  const now = new Date().toISOString();
  const deck: Deck = {
    id: createId('deck'),
    name: name.value,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, value: { data: { ...data, decks: [...data.decks, deck] }, value: deck } };
}

export function renameDeckInData(
  data: AppData,
  id: EntityId,
  input: string,
): Result<DataChange<Deck>> {
  const currentDeck = data.decks.find((deck) => deck.id === id);
  if (!currentDeck) {
    return {
      ok: false,
      error: { code: 'not-found', message: 'この単語帳は見つかりませんでした。' },
    };
  }
  const name = validateDeckName(input);
  if (!name.ok) return name;
  const deck: Deck = { ...currentDeck, name: name.value, updatedAt: new Date().toISOString() };
  return {
    ok: true,
    value: {
      data: { ...data, decks: data.decks.map((item) => (item.id === id ? deck : item)) },
      value: deck,
    },
  };
}

export function deleteDeckFromData(data: AppData, id: EntityId): Result<DataChange<void>> {
  if (!data.decks.some((deck) => deck.id === id)) {
    return {
      ok: false,
      error: { code: 'not-found', message: 'この単語帳は見つかりませんでした。' },
    };
  }
  return {
    ok: true,
    value: {
      data: {
        ...data,
        decks: data.decks.filter((deck) => deck.id !== id),
        folders: data.folders.filter((folder) => folder.deckId !== id),
        // 所属単語と学習セッションも同時に除き、参照先のないデータを残さない。
        words: data.words.filter((word) => word.deckId !== id),
        activeSession: data.activeSession?.deckId === id ? null : data.activeSession,
      },
      value: undefined,
    },
  };
}

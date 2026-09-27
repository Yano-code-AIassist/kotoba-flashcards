import { describe, expect, it } from 'vitest';
import type { AppData } from '../types/domain';
import { createInitialAppData } from './appRepository';
import { createMemoryRepository } from './memoryRepository';

function sampleData(): AppData {
  return {
    ...createInitialAppData(),
    decks: [
      {
        id: 'deck-a',
        name: '基本情報',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}

describe('メモリ保存', () => {
  it('初回は未保存を返し、成功した保存ごとにrevisionを増やす', async () => {
    const repository = createMemoryRepository();
    expect(await repository.load()).toEqual({ ok: true, value: null });
    const first = await repository.save(createInitialAppData(), 0);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('保存に失敗しました');
    expect(first.value).toMatchObject({ version: 2, revision: 1, decks: [], words: [] });
    const second = await repository.save(first.value, 1);
    expect(second).toMatchObject({ ok: true, value: { revision: 2 } });
  });

  it('初期データ、保存入力、返却データの変更から保存値を保護する', async () => {
    const seed = sampleData();
    const repository = createMemoryRepository(seed);
    seed.decks[0].name = '外部から変更';
    seed.settings.swipeEnabled = false;
    const loaded = await repository.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.value) throw new Error('読み込みに失敗しました');
    expect(loaded.value.decks[0].name).toBe('基本情報');
    expect(loaded.value.settings.swipeEnabled).toBe(true);

    const input = loaded.value;
    const saved = await repository.save(input, 0);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error('保存に失敗しました');
    input.decks[0].name = '保存後に入力を変更';
    saved.value.decks[0].name = '保存の返却値を変更';
    const reloaded = await repository.load();
    expect(reloaded).toMatchObject({ ok: true, value: { decks: [{ name: '基本情報' }] } });
    if (!reloaded.ok || !reloaded.value) throw new Error('読み込みに失敗しました');
    reloaded.value.settings.swipeEnabled = false;
    expect(await repository.load()).toMatchObject({
      ok: true,
      value: { settings: { swipeEnabled: true } },
    });
  });

  it('同じrevisionからの同時保存は一方だけ成功し、古い変更を上書きさせない', async () => {
    const repository = createMemoryRepository();
    const [first, second] = await Promise.all([
      repository.save(sampleData(), 0),
      repository.save(createInitialAppData(), 0),
    ]);
    expect(first).toMatchObject({ ok: true, value: { revision: 1 } });
    expect(second).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await repository.load()).toMatchObject({
      ok: true,
      value: { revision: 1, decks: [{ id: 'deck-a' }] },
    });
  });

  it('入力と期待revisionの不一致を拒否し、保存値を維持する', async () => {
    const repository = createMemoryRepository(sampleData());
    const invalid = { ...sampleData(), revision: 3, decks: [] };
    expect(await repository.save(invalid, 0)).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await repository.load()).toMatchObject({
      ok: true,
      value: { revision: 0, decks: [{ id: 'deck-a' }] },
    });
  });
});

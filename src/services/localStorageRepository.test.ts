import { afterEach, describe, expect, it, vi } from 'vitest';
import { storedDataFixture } from '../test/storedDataFixture';
import { createInitialAppData } from './appRepository';
import { createLocalStorageRepository, STORAGE_KEY } from './localStorageRepository';

function fakeStorage(raw?: string) {
  const entries = new Map<string, string>(raw === undefined ? [] : [[STORAGE_KEY, raw]]);
  const storage = {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
  };
  return { storage, entries, repository: createLocalStorageRepository(() => storage) };
}

afterEach(() => vi.unstubAllGlobals());

describe('LocalStorage保存', () => {
  it('初回の読み込みでは書き込まず、最初の操作で1件のJSONを保存する', async () => {
    const { repository, storage, entries } = fakeStorage();
    expect(await repository.load()).toEqual({ ok: true, value: null });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(await repository.save(createInitialAppData(), 0)).toMatchObject({
      ok: true,
      value: { revision: 1 },
    });
    expect(entries.size).toBe(1);
    expect(JSON.parse(entries.get(STORAGE_KEY)!)).toMatchObject({ version: 2, revision: 1 });
  });

  it('別のrepositoryでも全項目を復元し、返却値の変更が保存内容に影響しない', async () => {
    const sample = storedDataFixture();
    const { repository, storage } = fakeStorage(JSON.stringify(sample));
    expect(await repository.load()).toEqual({ ok: true, value: sample });
    const saved = await repository.save(sample, 7);
    if (!saved.ok) throw new Error('保存失敗');
    saved.value.words[0].answer = '表示側の変更';
    sample.settings.swipeEnabled = true;
    const reopened = createLocalStorageRepository(() => storage);
    expect(await reopened.load()).toEqual({
      ok: true,
      value: { ...storedDataFixture(), revision: 8 },
    });
  });

  it.each(['', '{broken', 'null', JSON.stringify({ version: 99 })])(
    '読めない元データ %j を上書きしない',
    async (raw) => {
      const { repository, storage, entries } = fakeStorage(raw);
      expect((await repository.load()).ok).toBe(false);
      expect(repository.recovery!.getOriginal()).toEqual({ ok: true, value: raw });
      expect((await repository.save(createInitialAppData(), 0)).ok).toBe(false);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(entries.get(STORAGE_KEY)).toBe(raw);
    },
  );

  it('保存領域へのアクセス自体が禁止されていても例外を外へ出さない', async () => {
    const repository = createLocalStorageRepository(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(await repository.load()).toMatchObject({ ok: false, error: { code: 'unavailable' } });
    expect(await repository.save(createInitialAppData(), 0)).toMatchObject({
      ok: false,
      error: { code: 'unavailable' },
    });
    expect(repository.recovery!.getOriginal().ok).toBe(false);
  });

  it.each([
    ['QuotaExceededError', 'quota-exceeded'],
    ['SecurityError', 'unavailable'],
    ['Error', 'write-failed'],
  ])('%sで失敗しても元データを維持し、再試行できる', async (name, code) => {
    const raw = JSON.stringify(storedDataFixture());
    const { repository, storage, entries } = fakeStorage(raw);
    await repository.load();
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException('failed', name);
    });
    expect(await repository.save(storedDataFixture(), 7)).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(entries.get(STORAGE_KEY)).toBe(raw);
    expect(await repository.save(storedDataFixture(), 7)).toMatchObject({
      ok: true,
      value: { revision: 8 },
    });
  });

  it('イベントがなくても保存直前に他タブの更新を検知する', async () => {
    const { repository, storage } = fakeStorage(JSON.stringify(storedDataFixture()));
    const other = createLocalStorageRepository(() => storage);
    await repository.load();
    await other.load();
    await other.save(storedDataFixture(), 7);
    expect(await repository.save(storedDataFixture(), 7)).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await repository.load()).toMatchObject({ ok: true, value: { revision: 8 } });
  });

  it('同じrevisionの置換や、外部での削除も検知する', async () => {
    const { repository, entries } = fakeStorage(JSON.stringify(storedDataFixture()));
    await repository.load();
    entries.set(
      STORAGE_KEY,
      JSON.stringify({
        ...storedDataFixture(),
        settings: { defaultStudyMode: 'all', swipeEnabled: true },
      }),
    );
    expect(await repository.save(storedDataFixture(), 7)).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    entries.delete(STORAGE_KEY);
    expect(await repository.save(storedDataFixture(), 7)).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
  });

  it('初回読み込み後に別タブがrevision 0を書いた場合も上書きしない', async () => {
    const { repository, entries } = fakeStorage();
    await repository.load();
    entries.set(STORAGE_KEY, JSON.stringify(createInitialAppData()));
    expect(await repository.save(createInitialAppData(), 0)).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
  });

  it('不正な所属やrevisionを持つ書き込み要求を拒否する', async () => {
    const { repository, storage } = fakeStorage(JSON.stringify(storedDataFixture()));
    const invalid = storedDataFixture();
    invalid.words[0].deckId = 'missing';
    expect((await repository.save(invalid, 7)).ok).toBe(false);
    expect((await repository.save(storedDataFixture(), 6)).ok).toBe(false);
    expect(
      (
        await repository.save(
          { ...storedDataFixture(), revision: Number.MAX_SAFE_INTEGER },
          Number.MAX_SAFE_INTEGER,
        )
      ).ok,
    ).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('初期化は確認した破損データだけを削除し、他のキーを残す', async () => {
    const { repository, entries } = fakeStorage('{broken');
    entries.set('another-app', 'keep');
    await repository.load();
    expect(await repository.recovery!.reset('{broken')).toEqual({ ok: true, value: undefined });
    expect(entries.has(STORAGE_KEY)).toBe(false);
    expect(entries.get('another-app')).toBe('keep');
    expect(await repository.load()).toEqual({ ok: true, value: null });
  });

  it('初期化確認の後で元データが変わった場合は削除しない', async () => {
    const { repository, entries, storage } = fakeStorage('{broken');
    await repository.load();
    entries.set(STORAGE_KEY, JSON.stringify(storedDataFixture()));
    expect(await repository.recovery!.reset('{broken')).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('初期化の失敗後も元データを退避できる', async () => {
    const { repository, storage, entries } = fakeStorage('{broken');
    await repository.load();
    storage.removeItem.mockImplementationOnce(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect((await repository.recovery!.reset('{broken')).ok).toBe(false);
    expect(entries.get(STORAGE_KEY)).toBe('{broken');
    expect(repository.recovery!.getOriginal()).toEqual({ ok: true, value: '{broken' });
  });

  it('関係するstorageイベントだけを通知し、購読を解除できる', async () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const { repository, storage, entries } = fakeStorage();
    await repository.load();
    const changed = vi.fn();
    const off = repository.subscribe!(changed);
    const emit = (key: string | null, area: unknown = storage) => {
      const event = new Event('storage');
      Object.defineProperties(event, { key: { value: key }, storageArea: { value: area } });
      target.dispatchEvent(event);
    };
    entries.set(STORAGE_KEY, JSON.stringify(storedDataFixture()));
    emit('another-app');
    emit(STORAGE_KEY, {});
    expect(changed).not.toHaveBeenCalled();
    emit(STORAGE_KEY);
    expect(changed).toHaveBeenCalledTimes(1);
    await repository.load();
    emit(STORAGE_KEY);
    expect(changed).toHaveBeenCalledTimes(1);
    entries.delete(STORAGE_KEY);
    emit(null);
    expect(changed).toHaveBeenCalledTimes(2);
    off();
    emit(null);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});

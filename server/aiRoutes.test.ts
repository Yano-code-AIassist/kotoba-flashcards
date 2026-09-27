import { mkdirSync, mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiGenerateResult } from '../src/types/ai';
import type { ServerConfig } from './config';

const generation = vi.hoisted(() => vi.fn());
vi.mock('./aiGeneration', async () => ({
  ...(await vi.importActual<typeof import('./aiGeneration')>('./aiGeneration')),
  generateAiWords: generation,
}));

import { createBackend } from './backend';
import { AiGenerationError } from './aiGeneration';

const origin = 'http://127.0.0.1:5173';
const config: ServerConfig = {
  origin,
  secret: 'ai-routes-test-only-secret-914536842019',
  databasePath: ':memory:',
  production: false,
  ai: {
    provider: 'gemini',
    apiKey: 'private-test-key',
    model: 'test-model',
    userDailyLimit: 20,
    globalDailyLimit: 50,
  },
};
const input = {
  count: 1,
  source: {
    kind: 'text',
    text: 'CPUは中央演算処理装置です。コンピューター内で命令の実行や計算を行います。',
  },
};
const generated: AiGenerateResult = {
  words: [{ question: 'CPUとは？', answer: '中央演算処理装置', note: '出典：貼り付けた資料' }],
  source: { label: '貼り付けた資料' },
  warnings: [],
};
type Identity = { id: string; cookie: string };
type Backend = Awaited<ReturnType<typeof createBackend>>;
type Fixture = { backend: Backend; server: Server; base: string; closed: boolean };
const fixtures: Fixture[] = [];
let main: Fixture;
let alice: Identity;
let bob: Identity;
let charlie: Identity;
let accountIndex = 0;

async function start(settings = config): Promise<Fixture> {
  const backend = await createBackend(settings);
  const server = backend.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No listening address');
  const fixture = { backend, server, base: `http://127.0.0.1:${address.port}`, closed: false };
  fixtures.push(fixture);
  return fixture;
}

async function stop(fixture: Fixture) {
  if (fixture.closed) return;
  await new Promise<void>((resolve, reject) =>
    fixture.server.close((error) => (error ? reject(error) : resolve())),
  );
  await fixture.backend.close();
  fixture.closed = true;
}

function request(
  fixture: Fixture,
  path: string,
  body?: unknown,
  identity?: Identity,
  overrides: Record<string, string> = {},
) {
  return fetch(`${fixture.base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(identity ? { Cookie: identity.cookie, 'X-Kotoba-User': identity.id } : {}),
      ...overrides,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signup(fixture: Fixture): Promise<Identity> {
  const email = `ai-user-${++accountIndex}@example.test`;
  const response = await request(fixture, '/api/auth/sign-up/email', {
    email,
    name: email,
    password: 'Ai-test-password-813462!',
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { user: { id: string } };
  return {
    id: body.user.id,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  };
}

function persistentConfig(userDailyLimit: number, globalDailyLimit: number): ServerConfig {
  mkdirSync('.artifacts', { recursive: true });
  const directory = mkdtempSync(join('.artifacts', 'ai-route-test-'));
  return {
    ...config,
    databasePath: join(directory, 'test.sqlite'),
    ai: { ...config.ai!, userDailyLimit, globalDailyLimit },
  };
}

beforeAll(async () => {
  main = await start();
  alice = await signup(main);
  bob = await signup(main);
  charlie = await signup(main);
});
beforeEach(() => generation.mockReset().mockResolvedValue(generated));
afterAll(async () => {
  for (const fixture of fixtures) await stop(fixture);
});

describe('AI生成APIの認証・確認前の非保存（実HTTP / SQLite）', () => {
  it('未ログインでは設定取得も生成も実行できない', async () => {
    expect((await request(main, '/api/ai/config')).status).toBe(401);
    expect((await request(main, '/api/ai/generate', input)).status).toBe(401);
    expect(generation).not.toHaveBeenCalled();
  });

  it('別アカウントIDや外部Originからの生成を拒否する', async () => {
    expect(
      (await request(main, '/api/ai/config', undefined, alice, { 'X-Kotoba-User': bob.id })).status,
    ).toBe(403);
    expect(
      (await request(main, '/api/ai/generate', input, alice, { 'X-Kotoba-User': bob.id })).status,
    ).toBe(403);
    expect(
      (await request(main, '/api/ai/generate', input, alice, { Origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
    expect(generation).not.toHaveBeenCalled();
  });

  it('設定の公開レスポンスにAPIキーや内部設定を含めない', async () => {
    const response = await request(main, '/api/ai/config', undefined, alice);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      enabled: true,
      provider: 'Google Gemini（無料枠対応）',
    });
  });

  it('AI未設定時は利用不可を返し、外部処理を実行しない', async () => {
    const disabled = await start({ ...config, ai: undefined });
    const user = await signup(disabled);
    expect(await (await request(disabled, '/api/ai/config', undefined, user)).json()).toEqual({
      enabled: false,
      provider: 'Google Gemini（無料枠対応）',
    });
    expect((await request(disabled, '/api/ai/generate', input, user)).status).toBe(503);
    expect(generation).not.toHaveBeenCalled();
    await stop(disabled);
  });

  it.each([
    {},
    { ...input, count: 31 },
    { count: 1, source: { kind: 'text', text: '短すぎる' } },
    { count: 1, source: { kind: 'url', url: 'http://127.0.0.1/private' } },
  ])('実物の入力検証で不正な要求を400にし、生成回数を消費しない', async (body) => {
    expect((await request(main, '/api/ai/generate', body, alice)).status).toBe(400);
    expect(generation).not.toHaveBeenCalled();
    expect(
      await main.backend.db
        .prepare('SELECT used FROM ai_usage WHERE bucket = ?')
        .get(`user:${alice.id}`),
    ).toBeUndefined();
  });

  it('生成結果を返すだけで、利用者の単語帳には保存しない', async () => {
    const response = await request(main, '/api/ai/generate', input, alice);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(generated);
    expect(generation).toHaveBeenCalledWith(config.ai, input, expect.any(AbortSignal));
    expect(await (await request(main, '/api/data', undefined, alice)).json()).toEqual({
      data: null,
    });
    expect(await main.backend.db.prepare('SELECT COUNT(*) AS count FROM app_data').get()).toEqual({
      count: 0,
    });
  });

  it('同じ利用者の重複生成と3人目の同時生成を制限し、完了後は再び生成できる', async () => {
    let finish!: (value: AiGenerateResult) => void;
    generation.mockImplementation(
      () =>
        new Promise<AiGenerateResult>((resolve) => {
          finish = resolve;
        }),
    );
    const first = request(main, '/api/ai/generate', input, alice);
    await vi.waitFor(() => expect(generation).toHaveBeenCalledTimes(1));
    const finishFirst = finish;
    expect((await request(main, '/api/ai/generate', input, alice)).status).toBe(429);
    const second = request(main, '/api/ai/generate', input, bob);
    await vi.waitFor(() => expect(generation).toHaveBeenCalledTimes(2));
    const finishSecond = finish;
    try {
      expect((await request(main, '/api/ai/generate', input, charlie)).status).toBe(429);
      expect(generation).toHaveBeenCalledTimes(2);
    } finally {
      finishFirst(generated);
      finishSecond(generated);
    }
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    generation.mockResolvedValue(generated);
    expect((await request(main, '/api/ai/generate', input, alice)).status).toBe(200);
  });

  it('生成エラー後も同時実行の枠を解放する', async () => {
    generation.mockRejectedValueOnce(new AiGenerationError('資料の生成に失敗しました。', 502));
    const failed = await request(main, '/api/ai/generate', input, charlie);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: { message: '資料の生成に失敗しました。' } });
    expect((await request(main, '/api/ai/generate', input, charlie)).status).toBe(200);
  });
});

describe('AI生成の日次利用上限の永続化', () => {
  it('利用者別上限は再起動後も残り、他の利用者は利用できる', async () => {
    const settings = persistentConfig(1, 10);
    const first = await start(settings);
    const user = await signup(first);
    expect((await request(first, '/api/ai/generate', input, user)).status).toBe(200);
    await stop(first);
    const restarted = await start(settings);
    expect((await request(restarted, '/api/ai/generate', input, user)).status).toBe(429);
    const other = await signup(restarted);
    expect((await request(restarted, '/api/ai/generate', input, other)).status).toBe(200);
    expect(generation).toHaveBeenCalledTimes(2);
    await stop(restarted);
  });

  it('複数サーバーでも全体の日次上限を共有し、同時要求や再起動で上限を超えない', async () => {
    const settings = persistentConfig(10, 1);
    const first = await start(settings);
    const one = await signup(first);
    const two = await signup(first);
    const second = await start(settings);
    const responses = await Promise.all([
      request(first, '/api/ai/generate', input, one),
      request(second, '/api/ai/generate', input, two),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 429]);
    expect(generation).toHaveBeenCalledTimes(1);
    expect(
      await second.backend.db.prepare('SELECT used FROM ai_usage WHERE bucket = ?').get('global'),
    ).toEqual({ used: 1 });
    await stop(first);
    await stop(second);
    const restarted = await start(settings);
    expect((await request(restarted, '/api/ai/generate', input, one)).status).toBe(429);
    expect(generation).toHaveBeenCalledTimes(1);
    await stop(restarted);
  });
});

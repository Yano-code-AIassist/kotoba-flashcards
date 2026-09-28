import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createBackend } from './backend';
import { readConfig } from './config';
import { createInitialAppData } from '../src/services/appRepository';
import type { AppData } from '../src/types/domain';

const origin = 'http://127.0.0.1:5173';
type Identity = { id: string; cookie: string };
let postgres: PGlite;
let socket: PGLiteSocketServer;
let backend: Awaited<ReturnType<typeof createBackend>>;
let server: Server;
let base: string;
let databaseUrl: string;
let alice: Identity, bob: Identity;
const date = '2026-09-24T00:00:00.000Z';
const config = {
  origin,
  secret: 'postgres-test-secret-123456789012345678901234567890',
  databasePath: ':memory:',
  production: false,
};

function request(path: string, body?: unknown, identity?: Identity) {
  return fetch(base + path, {
    method: body === undefined ? 'GET' : path === '/api/data' ? 'PUT' : 'POST',
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(identity ? { Cookie: identity.cookie, 'X-Kotoba-User': identity.id } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function signup(email: string): Promise<Identity> {
  const response = await request('/api/auth/sign-up/email', {
    email,
    password: 'Test-password-321739!',
    name: 'Postgres検証',
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { user: { id: string } };
  return {
    id: body.user.id,
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
}
async function startApp() {
  backend = await createBackend({ ...config, databaseUrl });
  server = backend.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  base = `http://127.0.0.1:${address.port}`;
}
async function stopApp() {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await backend.close();
}

describe('PostgreSQL保存（PGliteのTCP接続を使う統合テスト）', () => {
  beforeAll(async () => {
    postgres = await PGlite.create();
    socket = new PGLiteSocketServer({
      db: postgres,
      port: 0,
      host: '127.0.0.1',
      maxConnections: 8,
    });
    await socket.start();
    databaseUrl = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
    await startApp();
    alice = await signup('alice-pg@example.test');
    bob = await signup('bob-pg@example.test');
  }, 30000);
  afterAll(async () => {
    if (server?.listening) await stopApp();
    await socket?.stop();
    await postgres?.close();
  }, 15000);
  it('SQLのマイグレーションとアカウント別保存を通し、別アカウントへ漏らさない', async () => {
    const data = createInitialAppData();
    data.decks.push({ id: 'deck-1', name: '基本情報技術者', createdAt: date, updatedAt: date });
    data.folders.push({
      id: 'folder-1',
      deckId: 'deck-1',
      parentId: null,
      name: '基礎理論',
      createdAt: date,
      updatedAt: date,
    });
    data.words.push({
      id: 'word-1',
      deckId: 'deck-1',
      folderId: 'folder-1',
      question: '2進数',
      answer: '0と1',
      note: '',
      status: 'unlearned',
      createdAt: date,
      updatedAt: date,
      lastStudiedAt: null,
    });
    const response = await request('/api/data', { data, expectedRevision: 0 }, alice);
    expect(response.status).toBe(200);
    const saved = ((await response.json()) as { data: AppData }).data;
    expect(saved.words).toEqual(data.words);
    expect(saved.folders).toEqual(data.folders);
    expect(await (await request('/api/data', undefined, bob)).json()).toEqual({ data: null });
    expect((await request('/api/data')).status).toBe(401);
    expect(await (await request('/api/data/revision', undefined, alice)).json()).toEqual({
      revision: 1,
    });
  });
  it('同時の初回保存と更新は1件だけ成功し、古いrevisionで上書きしない', async () => {
    const data = createInitialAppData();
    let responses = await Promise.all([
      request('/api/data', { data, expectedRevision: 0 }, bob),
      request('/api/data', { data, expectedRevision: 0 }, bob),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const saved = (
      (await (await request('/api/data', undefined, alice)).json()) as { data: AppData }
    ).data;
    const next = structuredClone(saved);
    next.words[0].status = 'remembered';
    responses = await Promise.all([
      request('/api/data', { data: next, expectedRevision: 1 }, alice),
      request('/api/data', { data: saved, expectedRevision: 1 }, alice),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await (await request('/api/data/revision', undefined, alice)).json()).toEqual({
      revision: 2,
    });
  });
  it('アプリを再起動してもアカウントと階層が残る', async () => {
    const before = await (await request('/api/data', undefined, alice)).json();
    await stopApp();
    await startApp();
    expect(await (await request('/api/data', undefined, alice)).json()).toEqual(before);
    expect(await (await request('/api/health')).json()).toEqual({ status: 'ok' });
  }, 15000);
  it('ログアウト後は以前のCookieを拒否する', async () => {
    expect((await request('/api/auth/sign-out', {}, alice)).status).toBe(200);
    expect((await request('/api/data', undefined, alice)).status).toBe(401);
  });
});

it('無料ホスティングではPostgreSQLを必須にし、誤った設定で一時SQLiteへ保存しない', () => {
  const env = {
    NODE_ENV: 'production',
    RENDER_EXTERNAL_URL: 'https://kotoba-test.onrender.com',
    BETTER_AUTH_SECRET: config.secret,
    RESEND_API_KEY: 'test-key',
    MAIL_FROM: 'test@example.test',
    REQUIRE_POSTGRES: 'true',
  };
  expect(() => readConfig(env)).toThrow(/DATABASE_URL/);
  expect(() => readConfig({ ...env, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  expect(() =>
    readConfig({ ...env, DATABASE_URL: 'postgresql://user:secret@db.example.com/app' }),
  ).toThrow(/sslmode/);
  expect(() =>
    readConfig({
      ...env,
      DATABASE_URL:
        'postgresql://user:[YOUR-PASSWORD]@db.example.com/app?sslmode=require',
    }),
  ).toThrow(/DATABASE_PASSWORD/);
  const configured = readConfig({
    ...env,
    DATABASE_URL:
      'postgresql://user:[YOUR-PASSWORD]@db.example.com/app?sslmode=verify-full',
    DATABASE_PASSWORD: '記号/を含む@安全なパスワード',
  });
  expect(configured.origin).toBe('https://kotoba-test.onrender.com');
  expect(configured.databaseUrl).toContain('sslmode=verify-full');
  expect(new URL(configured.databaseUrl!).password).toBe(
    encodeURIComponent('記号/を含む@安全なパスワード'),
  );
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { createBackend } from './backend';
import { readConfig } from './config';
import { createInitialAppData } from '../src/services/appRepository';
import type { ServerConfig } from './config';
import type { AppData } from '../src/types/domain';

const mail = vi.hoisted(() => [] as { to: string; text: string }[]);
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: async (message: { to: string; text: string }) => {
        mail.push(message);
      },
      close: () => {},
    }),
  },
}));
const origin = 'http://127.0.0.1:5173';
const config: ServerConfig = {
  origin,
  secret: 'test-only-random-secret-519034759130475913047513',
  databasePath: ':memory:',
  production: false,
};
type Backend = Awaited<ReturnType<typeof createBackend>>;
type Identity = { id: string; cookie: string };
let backend: Backend;
let server: Server;
let base: string;
let alice: Identity;
let bob: Identity;
const password = 'Test-password-739128!';

async function listen(instance: Backend) {
  const listener = instance.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => listener.once('listening', resolve));
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  return { listener, url: `http://127.0.0.1:${address.port}` };
}
async function stop(listener: Server, instance: Backend) {
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  await instance.close();
}
function request(
  path: string,
  body?: unknown,
  identity?: Identity,
  overrides: Record<string, string> = {},
) {
  return fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : path === '/api/data' ? 'PUT' : 'POST',
    redirect: 'manual',
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(identity ? { Cookie: identity.cookie, 'X-Kotoba-User': identity.id } : {}),
      ...overrides,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function signup(email: string) {
  const response = await request('/api/auth/sign-up/email', {
    name: email.split('@')[0],
    email,
    password,
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

describe('認証とアカウントごとの保存（実HTTP / SQLite）', () => {
  beforeAll(async () => {
    backend = await createBackend(config);
    const running = await listen(backend);
    server = running.listener;
    base = running.url;
    alice = await signup('alice@example.test');
    bob = await signup('bob@example.test');
  });
  afterAll(async () => stop(server, backend));
  it('パスワードを平文保存せず、HttpOnly Cookieでログインする', async () => {
    expect(alice.cookie).toContain('session_token');
    const row = await backend.db
      .prepare('SELECT password FROM account WHERE userId = ?')
      .get(alice.id);
    expect(row?.password).toBeTypeOf('string');
    expect(row?.password).not.toBe(password);
    const response = await request('/api/auth/sign-in/email', {
      email: 'alice@example.test',
      password,
    });
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);
  });
  it('未ログインの読み書きを拒否する', async () => {
    expect((await request('/api/data')).status).toBe(401);
    expect(
      (await request('/api/data', { data: createInitialAppData(), expectedRevision: 0 })).status,
    ).toBe(401);
  });
  it('新規アカウントには他人のデータがない', async () => {
    expect(await (await request('/api/data', undefined, alice)).json()).toEqual({ data: null });
  });
  it('正常性とPC専用状態を返し、リクエストのHostをQR用URLに使わない', async () => {
    expect(await (await request('/api/health')).json()).toEqual({ status: 'ok' });
    expect(
      await (
        await request('/api/mobile-access', undefined, undefined, { Host: 'evil.example' })
      ).json(),
    ).toEqual({ url: null });
  });
  it('Aの保存データをBは読めず、利用者IDを偽装しても拒否される', async () => {
    const data = createInitialAppData();
    data.decks.push({
      id: 'alice-deck',
      name: 'Aliceの単語帳',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const saved = await request('/api/data', { data, expectedRevision: 0, userId: bob.id }, alice);
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { data: { revision: number } }).data.revision).toBe(1);
    expect(await (await request('/api/data', undefined, bob)).json()).toEqual({ data: null });
    expect((await request('/api/data', undefined, bob, { 'X-Kotoba-User': alice.id })).status).toBe(
      403,
    );
    expect(
      (
        await request('/api/data', { data, expectedRevision: 0 }, bob, {
          'X-Kotoba-User': alice.id,
        })
      ).status,
    ).toBe(403);
  });
  it('同時保存は片方だけ成功し、古い内容や二度目の移行で上書きしない', async () => {
    const data = createInitialAppData();
    const responses = await Promise.all([
      request('/api/data', { data, expectedRevision: 0 }, bob),
      request('/api/data', { data, expectedRevision: 0 }, bob),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await request('/api/data', { data, expectedRevision: 0 }, alice)).status).toBe(409);
    data.revision = 1;
    expect((await request('/api/data', { data, expectedRevision: 1 }, bob)).status).toBe(200);
    expect((await request('/api/data', { data, expectedRevision: 1 }, bob)).status).toBe(409);
  });
  it('別サイトからの保存・不正な形式・不正revisionを拒否する', async () => {
    const data = createInitialAppData();
    expect(
      (
        await request('/api/data', { data, expectedRevision: 0 }, alice, {
          Origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          '/api/data',
          { data: { ...data, decks: [{ name: 'invalid' }] }, expectedRevision: 0 },
          alice,
        )
      ).status,
    ).toBe(400);
    expect((await request('/api/data', { data, expectedRevision: -1 }, alice)).status).toBe(400);
    expect((await request('/api/data', { data, expectedRevision: 1 }, alice)).status).toBe(400);
  });
  it('個人データのHTTPキャッシュを無効にする', async () => {
    expect((await request('/api/data', undefined, alice)).headers.get('cache-control')).toBe(
      'no-store',
    );
    expect(await (await request('/api/data/revision', undefined, bob)).json()).toEqual({
      revision: 2,
    });
  });
  it('間違ったパスワードと外部Originでのログインを拒否する', async () => {
    expect(
      (
        await request('/api/auth/sign-in/email', {
          email: 'alice@example.test',
          password: 'wrong-password!',
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          '/api/auth/sign-in/email',
          { email: 'alice@example.test', password },
          undefined,
          { Origin: 'https://evil.example' },
        )
      ).status,
    ).toBe(403);
  });
  it('未設定の外部ログインは利用不可として返す', async () => {
    expect(await (await request('/api/config')).json()).toEqual({
      google: false,
      line: false,
      emailVerification: false,
      passwordReset: false,
    });
    expect(
      (await request('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/' })).ok,
    ).toBe(false);
  });
  it('階層を保存し、不正な親や旧クライアントからの保存で消失させない', async () => {
    const { data } = (await (await request('/api/data', undefined, alice)).json()) as {
      data: AppData;
    };
    const date = new Date().toISOString();
    data.folders = [
      {
        id: 'technology',
        deckId: 'alice-deck',
        parentId: null,
        name: 'テクノロジ系',
        createdAt: date,
        updatedAt: date,
      },
      {
        id: 'theory',
        deckId: 'alice-deck',
        parentId: 'technology',
        name: '基礎理論',
        createdAt: date,
        updatedAt: date,
      },
    ];
    data.words = [
      {
        id: 'binary',
        deckId: 'alice-deck',
        folderId: 'theory',
        question: '2進数',
        answer: '0と1で数を表す',
        note: '',
        status: 'unlearned',
        createdAt: date,
        updatedAt: date,
        lastStudiedAt: null,
      },
    ];
    const response = await request('/api/data', { data, expectedRevision: data.revision }, alice);
    expect(response.status).toBe(200);
    const saved = ((await response.json()) as { data: AppData }).data;
    expect(saved.folders).toEqual(data.folders);
    expect(saved.words).toEqual(data.words);
    const invalid = structuredClone(saved);
    invalid.folders[0].parentId = 'theory';
    expect(
      (await request('/api/data', { data: invalid, expectedRevision: saved.revision }, alice))
        .status,
    ).toBe(400);
    invalid.folders[0].parentId = 'missing';
    expect(
      (await request('/api/data', { data: invalid, expectedRevision: saved.revision }, alice))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/data',
          { data: { ...saved, version: 1, folders: undefined }, expectedRevision: saved.revision },
          alice,
        )
      ).status,
    ).toBe(409);
    expect(await (await request('/api/data', undefined, alice)).json()).toEqual({ data: saved });
    const other = ((await (await request('/api/data', undefined, bob)).json()) as { data: AppData })
      .data;
    expect(other.folders).toEqual([]);
    expect(other.words).toEqual([]);
  });
  it('ログアウトしたCookieではデータを読めない', async () => {
    expect((await request('/api/auth/sign-out', {}, alice)).status).toBe(200);
    expect((await request('/api/data', undefined, alice)).status).toBe(401);
  });
});

describe('メール確認とパスワード再設定', () => {
  beforeAll(async () => {
    backend = await createBackend({
      ...config,
      smtp: { host: 'smtp.example.test', port: 587, secure: false, from: 'kotoba@example.test' },
    });
    const running = await listen(backend);
    server = running.listener;
    base = running.url;
  });
  afterAll(async () => stop(server, backend));
  it('確認前はログインを拒否し、確認リンクから利用開始できる', async () => {
    await signup('verify@example.test');
    expect(
      (await request('/api/auth/sign-in/email', { email: 'verify@example.test', password })).status,
    ).toBe(403);
    const message = mail.find((m) => m.to === 'verify@example.test');
    expect(message).toBeDefined();
    const link = new URL(message!.text.match(/https?:\/\/\S+/)![0]);
    const response = await request(`${link.pathname}${link.search}`);
    expect(response.status).toBe(302);
    const login = await request('/api/auth/sign-in/email', {
      email: 'verify@example.test',
      password,
    });
    expect(login.status).toBe(200);
    const user = (await login.json()) as { user: { id: string } };
    alice = {
      id: user.user.id,
      cookie: login.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; '),
    };
  });
  it('再設定にトークンを必要とし、成功後は旧パスワード・旧セッションを失効する', async () => {
    const requested = await request('/api/auth/request-password-reset', {
      email: 'verify@example.test',
      redirectTo: `${origin}/?reset=1`,
    });
    expect(requested.status).toBe(200);
    const message = mail.at(-1)!;
    const link = new URL(message.text.match(/https?:\/\/\S+/)![0]);
    const redirect = await request(`${link.pathname}${link.search}`);
    const token = new URL(redirect.headers.get('location')!, origin).searchParams.get('token');
    expect(token).toBeTruthy();
    expect(
      (
        await request('/api/auth/reset-password', {
          token: 'invalid',
          newPassword: 'Another-password-123!',
        })
      ).ok,
    ).toBe(false);
    expect(
      (await request('/api/auth/reset-password', { token, newPassword: 'Another-password-123!' }))
        .status,
    ).toBe(200);
    expect(
      (await request('/api/auth/reset-password', { token, newPassword: 'Another-password-456!' }))
        .ok,
    ).toBe(false);
    expect(
      (await request('/api/auth/sign-in/email', { email: 'verify@example.test', password })).status,
    ).toBe(401);
    expect((await request('/api/data', undefined, alice)).status).toBe(401);
    // 前段の意図的な連続ログイン失敗による制限を解除し、新パスワード自体を検証する。
    await backend.db.exec('DELETE FROM rateLimit');
    expect(
      (
        await request('/api/auth/sign-in/email', {
          email: 'verify@example.test',
          password: 'Another-password-123!',
        })
      ).status,
    ).toBe(200);
  });
});

it('サーバーを再起動してもアカウントと単語帳が残る', async () => {
  mkdirSync('.artifacts', { recursive: true });
  const databasePath = join(mkdtempSync('.artifacts/auth-db-'), 'test.sqlite');
  backend = await createBackend({ ...config, databasePath });
  let running = await listen(backend);
  server = running.listener;
  base = running.url;
  const identity = await signup('persist@example.test');
  await request('/api/data', { data: createInitialAppData(), expectedRevision: 0 }, identity);
  await stop(server, backend);
  backend = await createBackend({ ...config, databasePath });
  running = await listen(backend);
  server = running.listener;
  base = running.url;
  try {
    expect(
      (
        (await (await request('/api/data', undefined, identity)).json()) as {
          data: { revision: number };
        }
      ).data.revision,
    ).toBe(1);
  } finally {
    await stop(server, backend);
  }
});

it('公開環境でHTTPS・固定シークレット・SMTP設定を必須にする', () => {
  expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/HTTPS/);
  expect(() =>
    readConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://kotoba.example' }),
  ).toThrow(/SECRET/);
  expect(() =>
    readConfig({
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://kotoba.example',
      BETTER_AUTH_SECRET: config.secret,
    }),
  ).toThrow(/SMTP/);
});

it('公開用QRには設定済みのHTTPSトップURLだけを返す', async () => {
  backend = await createBackend({
    ...config,
    origin: 'https://kotoba.example.com',
    production: true,
  });
  const running = await listen(backend);
  server = running.listener;
  base = running.url;
  try {
    const response = await request('/api/mobile-access?token=private-token', undefined, undefined, {
      Host: 'evil.example',
      'X-Forwarded-Host': 'evil.example',
    });
    expect(await response.json()).toEqual({ url: 'https://kotoba.example.com/' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  } finally {
    await stop(server, backend);
  }
});

it('Google・LINEの認証URLを発行し、改ざんしたstateと外部リダイレクトを拒否する', async () => {
  backend = await createBackend({
    ...config,
    google: { clientId: 'test-google-client', clientSecret: 'test-google-secret' },
    line: { clientId: 'test-line-client', clientSecret: 'test-line-secret' },
  });
  const running = await listen(backend);
  server = running.listener;
  base = running.url;
  try {
    for (const provider of ['google', 'line']) {
      const response = await request('/api/auth/sign-in/social', {
        provider,
        callbackURL: '/',
        disableRedirect: true,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { url: string };
      const url = new URL(body.url);
      expect(url.hostname).toBe(provider === 'google' ? 'accounts.google.com' : 'access.line.me');
      expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/${provider}`);
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('scope')).toContain('email');
      const forged = await request(`/api/auth/callback/${provider}?code=invalid&state=forged`);
      expect(forged.headers.get('location')).toContain('error');
      expect(forged.headers.get('set-cookie') || '').not.toContain('session_token=');
    }
    expect(
      (
        await request('/api/auth/sign-in/social', {
          provider: 'google',
          callbackURL: 'https://evil.example',
          disableRedirect: true,
        })
      ).status,
    ).toBe(403);
  } finally {
    await stop(server, backend);
  }
});

it('IPヘッダーを偽装しても繰り返しのログイン試行を制限する', async () => {
  backend = await createBackend(config);
  const running = await listen(backend);
  server = running.listener;
  base = running.url;
  try {
    await signup('limits@example.test');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (
          await request(
            '/api/auth/sign-in/email',
            {
              email: 'limits@example.test',
              password: 'wrong-password-123!',
            },
            undefined,
            { 'X-Forwarded-For': `192.0.2.${i + 1}`, 'X-Kotoba-Client-IP': `192.0.2.${i + 1}` },
          )
        ).status,
      );
    expect(statuses).toContain(429);
  } finally {
    await stop(server, backend);
  }
});

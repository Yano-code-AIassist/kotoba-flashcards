import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ServerConfig {
  origin: string;
  secret: string;
  databasePath: string;
  databaseUrl?: string;
  production: boolean;
  trustedProxies?: string[];
  google?: { clientId: string; clientSecret: string };
  line?: { clientId: string; clientSecret: string };
  resend?: { apiKey: string; from: string };
  ai?: {
    provider: 'gemini';
    apiKey: string;
    model: string;
    userDailyLimit: number;
    globalDailyLimit: number;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const origin = new URL(env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://127.0.0.1:5173')
    .origin;
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname);
  if ((production || !loopback) && !origin.startsWith('https://'))
    throw new Error('本番環境の APP_ORIGIN は HTTPS が必要です。');
  const dataDir = resolve('.data');
  let secret = env.BETTER_AUTH_SECRET;
  if (!secret) {
    if (production || !loopback) throw new Error('BETTER_AUTH_SECRET を設定してください。');
    mkdirSync(dataDir, { recursive: true });
    const secretFile = resolve(dataDir, 'auth-secret');
    if (!existsSync(secretFile))
      writeFileSync(secretFile, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 });
    secret = readFileSync(secretFile, 'utf8').trim();
  }
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET は32文字以上必要です。');
  let databaseUrl: string | undefined;
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
      if (env.DATABASE_PASSWORD) url.password = env.DATABASE_PASSWORD;
      const decodedPassword = decodeURIComponent(url.password);
      if (/YOUR[-_ ]?PASSWORD/i.test(decodedPassword))
        throw new Error('DATABASE_PASSWORD を設定してください。');
      if (
        production &&
        !['verify-full', 'verify-ca', 'require'].includes(url.searchParams.get('sslmode') || '')
      )
        throw new Error();
      databaseUrl = url.toString();
    } catch {
      throw new Error(
        'DATABASE_URL に正しいPostgreSQL接続URLを設定してください。パスワードを別欄にする場合は DATABASE_PASSWORD も必要です。本番は sslmode=require 以上が必要です。',
      );
    }
  }
  if (env.REQUIRE_POSTGRES === 'true' && !databaseUrl)
    throw new Error('この公開設定ではデータ保護のため DATABASE_URL が必須です。');
  const smtp =
    env.SMTP_HOST && env.SMTP_FROM
      ? {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT || 587),
          secure: env.SMTP_SECURE === 'true',
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          from: env.SMTP_FROM,
        }
      : undefined;
  if (!!env.RESEND_API_KEY !== !!env.MAIL_FROM)
    throw new Error('RESEND_API_KEY と MAIL_FROM は両方設定してください。');
  const resend =
    env.RESEND_API_KEY && env.MAIL_FROM
      ? { apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }
      : undefined;
  if (smtp && resend)
    throw new Error('メール送信は SMTP または Resend のどちらか一方を設定してください。');
  if ((production || !loopback) && !smtp && !resend)
    throw new Error('公開環境ではメール確認のため SMTP または Resend の設定が必要です。');
  function provider(prefix: string) {
    const clientId = env[`${prefix}_CLIENT_ID`];
    const clientSecret = env[`${prefix}_CLIENT_SECRET`];
    if (!!clientId !== !!clientSecret)
      throw new Error(`${prefix} の ID と Secret は両方設定してください。`);
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
  }
  function positiveLimit(name: string, fallback: number) {
    const value = Number(env[name] || fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > 10000)
      throw new Error(`${name} は1〜10000の整数にしてください。`);
    return value;
  }
  const geminiModel = env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(geminiModel))
    throw new Error('GEMINI_MODEL の形式を確認してください。');
  const ai = env.GEMINI_API_KEY?.trim()
    ? {
        provider: 'gemini' as const,
        apiKey: env.GEMINI_API_KEY.trim(),
        model: geminiModel,
        userDailyLimit: positiveLimit('AI_USER_DAILY_LIMIT', 10),
        globalDailyLimit: positiveLimit('AI_GLOBAL_DAILY_LIMIT', 50),
      }
    : undefined;
  return {
    origin,
    secret,
    production,
    trustedProxies: env.TRUSTED_PROXY_CIDRS?.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    smtp,
    resend,
    ai,
    databasePath: resolve(env.DATABASE_PATH || '.data/kotoba.sqlite'),
    databaseUrl,
    google: provider('GOOGLE'),
    line: provider('LINE'),
  };
}

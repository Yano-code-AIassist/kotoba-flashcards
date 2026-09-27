import { resolve } from 'node:path';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { validateAppData } from '../src/services/validateAppData';
import type { ServerConfig } from './config';
import { mobileAccessUrl } from './mobileAccess';
import { createMailer } from './mail';
import { createDatabase } from './database';
import { registerAiRoutes } from './aiRoutes';

export async function createBackend(config: ServerConfig) {
  const db = createDatabase(config);
  const mailer = createMailer(config);
  async function sendMail(to: string, subject: string, url: string) {
    if (!mailer) throw new Error('メール送信は未設定です。');
    await mailer.send(
      to,
      subject,
      `${subject}\n\n次のリンクを開いてください。\n${url}\n\n心当たりがない場合は、このメールを無視してください。`,
    );
  }
  const authOptions: BetterAuthOptions = {
    appName: 'kotoba',
    baseURL: config.origin,
    secret: config.secret,
    database: db.authDatabase,
    trustedOrigins: [config.origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: !!mailer,
      revokeSessionsOnPasswordReset: true,
      ...(mailer
        ? {
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) =>
              sendMail(user.email, 'kotoba パスワードの再設定', url),
          }
        : {}),
    },
    ...(mailer
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => sendMail(user.email, 'kotoba メールアドレスの確認', url),
          },
        }
      : {}),
    socialProviders: {
      ...(config.google ? { google: { ...config.google, prompt: 'select_account' as const } } : {}),
      ...(config.line ? { line: config.line } : {}),
    },
    account: {
      accountLinking: { enabled: true, disableImplicitLinking: true },
      encryptOAuthTokens: true,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
    advanced: {
      useSecureCookies: config.origin.startsWith('https://'),
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders: ['x-kotoba-client-ip'] },
    },
  };
  try {
    const migrations = await getMigrations(authOptions);
    await migrations.runMigrations();
    await db.exec(`CREATE TABLE IF NOT EXISTS app_data (
    user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL,
    document TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (
      bucket TEXT NOT NULL,
      day BIGINT NOT NULL,
      used BIGINT NOT NULL,
      PRIMARY KEY (bucket, day)
    )`);
  } catch (error) {
    mailer?.close();
    await db.close();
    throw error;
  }
  const auth = betterAuth(authOptions);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustedProxies || false);
  app.use((req, _res, next) => {
    // 利用者が偽装できるヘッダーを直接使わず、接続元と明示したプロキシからIPを解決する。
    req.headers['x-kotoba-client-ip'] = req.ip || req.socket.remoteAddress;
    next();
  });
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/config', (_req, res) =>
    res.json({
      google: !!config.google,
      line: !!config.line,
      emailVerification: !!mailer,
      passwordReset: !!mailer,
    }),
  );
  app.get('/api/health', async (_req, res) => {
    await db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  app.get('/api/mobile-access', (_req, res) => res.json({ url: mobileAccessUrl(config.origin) }));
  app.use('/api/auth', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && req.get('Origin') !== config.origin) {
      res.status(403).json({ code: 'INVALID_ORIGIN', message: '許可されていないアクセス元です。' });
      return;
    }
    next();
  });
  app.all('/api/auth/*splat', toNodeHandler(auth));
  app.use(['/api/data', '/api/ai'], async (req, res, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      res.status(401).json({
        error: {
          code: 'unavailable',
          message: 'ログインの有効期限が切れました。再度ログインしてください。',
        },
      });
      return;
    }
    // Cookieが別タブで切り替わっても、旧画面の内容を新しい利用者へ保存しない。
    if (req.get('X-Kotoba-User') !== session.user.id) {
      res.status(403).json({
        error: {
          code: 'unavailable',
          message: 'ログイン中のアカウントが変わりました。再読み込みしてください。',
        },
      });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method) && req.get('Origin') !== config.origin) {
      res
        .status(403)
        .json({ error: { code: 'unavailable', message: 'このアクセス元からは保存できません。' } });
      return;
    }
    res.locals.userId = session.user.id;
    next();
  });
  registerAiRoutes(app, config, db);
  app.get('/api/data/revision', async (_req, res) => {
    const row = await db
      .prepare('SELECT revision FROM app_data WHERE user_id = ?')
      .get(res.locals.userId);
    res.json({ revision: Number(row?.revision ?? 0) });
  });
  app.get('/api/data', async (_req, res) => {
    const row = await db
      .prepare('SELECT document FROM app_data WHERE user_id = ?')
      .get(res.locals.userId);
    res.json({ data: row ? JSON.parse(String(row.document)) : null });
  });
  app.use('/api/data', express.json({ limit: '8mb' }));
  app.put('/api/data', async (req, res) => {
    if (req.body?.data?.version === 1) {
      res.status(409).json({
        error: {
          code: 'conflict',
          message: 'アプリが更新されました。入力を控えてから再読み込みしてください。',
        },
      });
      return;
    }
    const valid = validateAppData(req.body?.data);
    const expected: unknown = req.body?.expectedRevision;
    if (
      !valid.ok ||
      typeof expected !== 'number' ||
      !Number.isSafeInteger(expected) ||
      expected < 0 ||
      expected >= Number.MAX_SAFE_INTEGER ||
      valid.value.revision !== expected
    ) {
      res
        .status(400)
        .json({ error: { code: 'validation', message: '保存内容の形式が正しくありません。' } });
      return;
    }
    const data = { ...valid.value, revision: expected + 1 };
    // INSERT/UPDATEそれぞれが一文で完了し、確認と保存の間へ別の書き込みが入らない。
    const updated =
      expected === 0
        ? await db
            .prepare(
              'INSERT INTO app_data (user_id, revision, document, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING',
            )
            .run(res.locals.userId, data.revision, JSON.stringify(data), new Date().toISOString())
        : await db
            .prepare(
              'UPDATE app_data SET revision = ?, document = ?, updated_at = ? WHERE user_id = ? AND revision = ?',
            )
            .run(
              data.revision,
              JSON.stringify(data),
              new Date().toISOString(),
              res.locals.userId,
              expected,
            );
    if (Number(updated.changes) !== 1) {
      res.status(409).json({
        error: {
          code: 'conflict',
          message: '別の端末やタブで更新されています。入力を控えてから再読み込みしてください。',
        },
      });
      return;
    }
    res.json({ data });
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: { code: 'not-found', message: 'APIが見つかりません。' } }),
  );
  if (config.production) {
    app.use(express.static(resolve('dist')));
    app.get('/{*splat}', (_req, res) => res.sendFile(resolve('dist/index.html')));
  }
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    void _next; // Expressがエラーハンドラーと認識するため4引数を維持する。
    const status =
      error?.type === 'entity.too.large' ? 413 : error?.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({
      error: {
        code: 'write-failed',
        message:
          status === 413
            ? '送信データが大きすぎます。資料ファイルは5MB以下に分けてください。'
            : status === 400
              ? '送信形式を確認してください。'
              : 'サーバーで処理できませんでした。時間をおいて再試行してください。',
      },
    });
  };
  app.use(handleError);
  return {
    app,
    auth,
    db,
    close: async () => {
      mailer?.close();
      await db.close();
    },
  };
}

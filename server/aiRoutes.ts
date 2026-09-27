import express from 'express';
import type { Express } from 'express';
import type { ServerConfig } from './config';
import type { createDatabase } from './database';
import { AiGenerationError, generateAiWords, validateAiRequest } from './aiGeneration';

// このルートの前でセッション・アカウントID・Originを検証する。
export function registerAiRoutes(
  app: Express,
  config: ServerConfig,
  db: ReturnType<typeof createDatabase>,
) {
  const activeUsers = new Set<string>();
  app.get('/api/ai/config', (_req, res) =>
    res.json({ enabled: !!config.ai, provider: 'Google Gemini（無料枠対応）' }),
  );
  app.use('/api/ai/generate', express.json({ limit: '8mb' }));
  app.post('/api/ai/generate', async (req, res) => {
    if (!config.ai) {
      res.status(503).json({
        error: { message: 'AI生成はまだ設定されていません。管理者に設定を依頼してください。' },
      });
      return;
    }
    const controller = new AbortController();
    const userId = String(res.locals.userId);
    let acquired = false;
    const release = () => {
      if (!acquired) return;
      activeUsers.delete(userId);
      acquired = false;
    };
    const abort = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', abort);
    try {
      const input = validateAiRequest(req.body);
      if (activeUsers.has(userId) || activeUsers.size >= 2)
        throw new AiGenerationError('別の生成を処理中です。完了してから再試行してください。', 429);
      activeUsers.add(userId);
      acquired = true;
      // 回数はDBに保存し、再起動・複数インスタンスでも上限を共有する。
      const day = Math.floor(Date.now() / 86_400_000);
      await db.prepare('DELETE FROM ai_usage WHERE day < ?').run(day);
      for (const [key, limit] of [
        [`user:${userId}`, config.ai.userDailyLimit],
        ['global', config.ai.globalDailyLimit],
      ] as const) {
        const reserved = await db
          .prepare(
            `INSERT INTO ai_usage (bucket, day, used) VALUES (?, ?, 1)
          ON CONFLICT(bucket, day) DO UPDATE SET used = ai_usage.used + 1 WHERE ai_usage.used < ?`,
          )
          .run(key, day, limit);
        if (reserved.changes !== 1)
          throw new AiGenerationError(
            '本日のAI生成回数の上限に達しました。翌日（UTC基準）にお試しください。',
            429,
          );
      }
      const result = await generateAiWords(config.ai, input, controller.signal);
      // 応答を受け取った直後の再試行も開始できるよう、処理中状態を先に解除する。
      release();
      if (!controller.signal.aborted) res.json(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      const known = error instanceof AiGenerationError;
      release();
      res.status(known ? error.status : 500).json({
        error: {
          message: known
            ? error.message
            : 'AI生成を開始できませんでした。時間をおいて再試行してください。',
        },
      });
    } finally {
      release();
      res.off('close', abort);
    }
  });
}

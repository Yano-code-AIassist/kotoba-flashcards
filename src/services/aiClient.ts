import {
  AI_MAX_FILE_BYTES,
  AI_MAX_WORDS,
  type AiConfig,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiSource,
} from '../types/ai';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function requestAi(
  path: string,
  userId: string,
  signal?: AbortSignal,
  body?: AiGenerateRequest,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    body ? 100_000 : 15_000,
  );
  try {
    const response = await fetch(`/api/ai/${path}`, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'X-Kotoba-User': userId,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = isRecord(value) ? value.error : null;
      const message = isRecord(error) ? error.message : error;
      throw new Error(
        typeof message === 'string'
          ? message
          : response.status === 401 || response.status === 403
            ? 'ログイン状態を確認できませんでした。ページを再読み込みしてください。'
            : 'AIに接続できませんでした。時間をおいて、もう一度お試しください。',
      );
    }
    return value;
  } catch (error) {
    if (timedOut)
      throw new Error('処理に時間がかかっています。資料を短くして、もう一度お試しください。', {
        cause: error,
      });
    if (signal?.aborted) throw new DOMException('生成を中止しました。', 'AbortError');
    if (error instanceof TypeError)
      throw new Error('通信できませんでした。インターネット接続を確認してください。', {
        cause: error,
      });
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function getAiConfig(userId: string, signal?: AbortSignal): Promise<AiConfig> {
  const value = await requestAi('config', userId, signal);
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || typeof value.provider !== 'string')
    throw new Error('AIの設定を読み込めませんでした。もう一度お試しください。');
  return { enabled: value.enabled, provider: value.provider };
}

export async function generateAiWords(
  userId: string,
  request: AiGenerateRequest,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const value = await requestAi('generate', userId, signal, request);
  if (
    !isRecord(value) ||
    !Array.isArray(value.words) ||
    value.words.length < 1 ||
    value.words.length > AI_MAX_WORDS ||
    !value.words.every(
      (word: unknown) =>
        isRecord(word) &&
        typeof word.question === 'string' &&
        typeof word.answer === 'string' &&
        typeof word.note === 'string',
    ) ||
    !isRecord(value.source) ||
    typeof value.source.label !== 'string' ||
    (value.source.url !== undefined && typeof value.source.url !== 'string') ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning: unknown) => typeof warning === 'string')
  )
    throw new Error('生成結果を読み込めませんでした。資料を変えて、もう一度お試しください。');
  return value as unknown as AiGenerateResult;
}

export async function readAiFile(file: File, signal?: AbortSignal): Promise<AiSource> {
  if (file.size === 0 || file.size > AI_MAX_FILE_BYTES)
    throw new Error('空ではない、5MB以下のファイルを選んでください。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('生成を中止しました。', 'AbortError');
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16_384)
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 16_384)));
  return { kind: 'file', name: file.name, data: btoa(parts.join('')) };
}

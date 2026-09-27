import type { AppRepository } from './appRepository';
import type { AppData } from '../types/domain';
import type { Result } from '../types/storage';
import { validateAppData } from './validateAppData';

export function createHttpRepository(userId: string): AppRepository {
  let observedRevision: number | undefined;
  let saving = false;
  let generation = 0;
  async function request(path: string, init?: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/data${path}`, {
        ...init,
        signal: controller.signal,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'X-Kotoba-User': userId,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      if (response.status === 401 || response.status === 403)
        window.dispatchEvent(new Event('kotoba-auth-expired'));
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function decode(response: Response): Promise<Result<AppData | null>> {
    const body = await response.json();
    if (!response.ok)
      return {
        ok: false,
        error: {
          code: response.status === 409 ? 'conflict' : 'unavailable',
          message: body.error?.message || 'サーバーに接続できませんでした。',
        },
      };
    if (body.data === null) return { ok: true, value: null };
    return validateAppData(body.data);
  }
  function offline(): Result<never> {
    return {
      ok: false,
      error: {
        code: 'unavailable',
        message:
          'サーバーに接続できません。通信状態を確認し、再試行してください。保存結果が不明な場合は再読み込みして確認してください。',
      },
    };
  }
  return {
    async load() {
      try {
        const result = await decode(await request(''));
        if (result.ok) observedRevision = result.value?.revision ?? 0;
        return result;
      } catch {
        return offline();
      }
    },
    async save(data, expectedRevision) {
      saving = true;
      generation += 1;
      try {
        const result = await decode(
          await request('', { method: 'PUT', body: JSON.stringify({ data, expectedRevision }) }),
        );
        if (!result.ok) return result;
        if (!result.value) return offline();
        observedRevision = result.value.revision;
        return { ok: true, value: result.value };
      } catch {
        return offline();
      } finally {
        saving = false;
        generation += 1;
      }
    },
    subscribe(onExternalChange) {
      let active = true;
      async function check() {
        if (saving || observedRevision === undefined || document.hidden) return;
        const before = generation;
        try {
          const response = await request('/revision');
          if (!response.ok) return;
          const { revision } = await response.json();
          if (active && !saving && before === generation && revision !== observedRevision)
            onExternalChange();
        } catch {
          /* 次の保存で通信エラーを表示し、入力は維持する。 */
        }
      }
      const timer = window.setInterval(() => void check(), 30000);
      window.addEventListener('focus', check);
      return () => {
        active = false;
        window.clearInterval(timer);
        window.removeEventListener('focus', check);
      };
    },
  };
}

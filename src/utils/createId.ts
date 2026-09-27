import type { EntityId } from '../types/domain';

export function createId(prefix: string): EntityId {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // スマホから開発サーバーへHTTP接続した場合も、名前や配列番号に頼らずIDを作る。
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

import { isIP } from 'node:net';

// QRには管理者が設定した公開トップURLだけを入れる。Hostヘッダーやログイントークンは使わない。
export function mobileAccessUrl(origin: string): string | null {
  const url = new URL(origin);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (!host.includes('.') || /\.(localhost|local|internal)$/.test(host)) return null;
  if (isIP(host) || host.startsWith('[')) return null;
  return `${url.origin}/`;
}

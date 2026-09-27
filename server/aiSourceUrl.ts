import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const SUPPORTED_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/pdf',
]);

export class SourceUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceUrlError';
  }
}

/** Reject special-use ranges, including IPv4 embedded in IPv6. */
export function isPublicSourceAddress(address: string): boolean {
  if (!isIP(address) || address.includes('%')) return false;
  const parsed = ipaddr.parse(address);
  if (parsed.range() !== 'unicast') return false;
  if (parsed.kind() === 'ipv4') {
    const ipv4 = parsed as ipaddr.IPv4;
    return !['198.18.0.0/15', '192.31.196.0/24', '192.52.193.0/24', '192.175.48.0/24'].some(
      (range) => ipv4.match(ipaddr.IPv4.parseCIDR(range)),
    );
  }
  const ipv6 = parsed as ipaddr.IPv6;
  return (
    ipv6.match(ipaddr.IPv6.parseCIDR('2000::/3')) &&
    !['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20'].some((range) =>
      ipv6.match(ipaddr.IPv6.parseCIDR(range)),
    )
  );
}

export function validatePublicSourceUrl(input: string): URL {
  let url: URL;
  try {
    if (input.length > 2_048) throw new Error();
    url = new URL(input);
  } catch {
    throw new SourceUrlError('公開されている資料のURLを正しく入力してください。');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new SourceUrlError(
      '認証情報や特別なポートを含まない、httpまたはhttpsのURLを指定してください。',
    );
  }
  const hostname = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (isIP(hostname)) {
    if (!isPublicSourceAddress(hostname)) throw privateAddressError();
  } else if (
    !hostname.includes('.') ||
    /(^|\.)(localhost|local|localdomain|internal|lan|home|invalid|test)$/.test(hostname)
  ) {
    throw privateAddressError();
  }
  url.hash = '';
  return url;
}

function privateAddressError() {
  return new SourceUrlError(
    'PC内や社内ネットワークのURLは取り込めません。公開URLを指定してください。',
  );
}

function abortError(signal: AbortSignal): SourceUrlError {
  return signal.reason instanceof SourceUrlError
    ? signal.reason
    : new SourceUrlError('URLの読み込みを中止しました。');
}

// DNS promises cannot be cancelled, so the deadline also races DNS resolution.
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface SourceResponse {
  bytes: Buffer;
  contentType: string;
  url: string;
}

async function readOnce(url: URL, signal: AbortSignal): Promise<SourceResponse | URL> {
  if (signal.aborted) throw abortError(signal);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await withAbort(lookup(hostname, { all: true, verbatim: true }), signal);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicSourceAddress(address))) {
    throw privateAddressError();
  }
  if (signal.aborted) throw abortError(signal);
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      url,
      {
        method: 'GET',
        agent: false,
        family: address.family,
        signal,
        // Preserve the original Host/SNI while connecting only to the validated IP.
        lookup: (_hostname, options, callback) => {
          callback(null, options.all ? [address] : address.address, address.family);
        },
        headers: {
          Accept: [...SUPPORTED_TYPES].join(', '),
          'Accept-Encoding': 'identity',
          'User-Agent': 'Kotoba-SourceReader/1.0',
        },
      },
      (res) => {
        const fail = (message: string) => {
          reject(new SourceUrlError(message));
          res.destroy();
          req.destroy();
        };
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          try {
            if (!res.headers.location) throw new Error();
            resolve(validatePublicSourceUrl(new URL(res.headers.location, url).href));
          } catch (error) {
            reject(
              error instanceof SourceUrlError
                ? error
                : new SourceUrlError('URLの転送先を確認できませんでした。'),
            );
          }
          res.destroy();
          req.destroy();
          return;
        }
        if (status < 200 || status >= 300) {
          fail('資料を取得できませんでした。ログイン不要で開ける公開URLか確認してください。');
          return;
        }
        const contentType = (res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (!SUPPORTED_TYPES.has(contentType)) {
          fail(
            'このURLのファイル形式には対応していません。Webページ・テキスト・PDFを指定してください。',
          );
          return;
        }
        const encoding = res.headers['content-encoding'];
        if (encoding && encoding.toLowerCase() !== 'identity') {
          fail('このURLの圧縮された応答は読み込めません。資料をファイルとして取り込んでください。');
          return;
        }
        const declaredSize = res.headers['content-length'];
        if (declaredSize && (!/^\d+$/.test(declaredSize) || Number(declaredSize) > MAX_BYTES)) {
          fail('資料は5MB以下にしてください。');
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) fail('資料は5MB以下にしてください。');
          else chunks.push(chunk);
        });
        res.on('end', () => resolve({ bytes: Buffer.concat(chunks), contentType, url: url.href }));
        res.on('error', reject);
        res.on('aborted', () =>
          reject(new SourceUrlError('資料の読み込みが途中で中断されました。')),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export async function readPublicSourceUrl(
  input: string,
  signal?: AbortSignal,
): Promise<SourceResponse> {
  let url = validatePublicSourceUrl(input);
  const controller = new AbortController();
  const onAbort = () => controller.abort(new SourceUrlError('URLの読み込みを中止しました。'));
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new SourceUrlError(
          'URLの読み込みに時間がかかっています。資料をファイルとして取り込んでください。',
        ),
      ),
    TIMEOUT_MS,
  );
  timeout.unref();
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const result = await withAbort(readOnce(url, controller.signal), controller.signal);
      if (!(result instanceof URL)) return result;
      url = result;
    }
    throw new SourceUrlError(
      'URLの転送が多すぎるため読み込めません。資料の直接のURLを指定してください。',
    );
  } catch (error) {
    if (controller.signal.aborted) throw abortError(controller.signal);
    if (error instanceof SourceUrlError) throw error;
    throw new SourceUrlError(
      'URLから資料を読み込めませんでした。URLを確認するか、ファイルとして取り込んでください。',
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

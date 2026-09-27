import { EventEmitter } from 'node:events';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:http', () => ({ request: mocks.request }));
vi.mock('node:https', () => ({ request: mocks.request }));

import { isPublicSourceAddress, readPublicSourceUrl, validatePublicSourceUrl } from './aiSourceUrl';

interface ResponsePlan {
  status?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
  pending?: boolean;
}

let plans: ResponsePlan[];
let responses: PassThrough[];

beforeEach(() => {
  plans = [];
  responses = [];
  mocks.lookup.mockReset().mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
  mocks.request
    .mockReset()
    .mockImplementation(
      (_url: URL, options: RequestOptions, callback: (res: IncomingMessage) => void) => {
        const plan = plans.shift() ?? {};
        const res = Object.assign(new PassThrough(), {
          statusCode: plan.status ?? 200,
          headers: { 'content-type': 'text/html; charset=utf-8', ...plan.headers },
        });
        responses.push(res);
        const req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
        req.end.mockImplementation(() => {
          queueMicrotask(() => {
            callback(res as unknown as IncomingMessage);
            if (!plan.pending && !res.destroyed) {
              for (const chunk of plan.chunks ?? [Buffer.from('<p>資料</p>')]) res.write(chunk);
              res.end();
            }
          });
        });
        options.signal?.addEventListener('abort', () => req.emit('error', new Error('aborted')), {
          once: true,
        });
        return req;
      },
    );
});

afterEach(() => vi.useRealTimers());

describe('公開資料URLの安全確認', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.4.5',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '192.0.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fec0::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:8.8.8.8',
    '64:ff9b::a00:1',
    '64:ff9b:1::1',
    '2001:db8::1',
    '2001:2::1',
    '2002:7f00:1::1',
    '3fff::1',
    'not-an-ip',
  ])('内部・特殊用途アドレスを拒否する: %s', (address) => {
    expect(isPublicSourceAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.215.14', '2606:4700:4700::1111'])(
    '公開アドレスを許可する: %s',
    (address) => {
      expect(isPublicSourceAddress(address)).toBe(true);
    },
  );

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/file',
    'https://user:secret@example.com',
    'http://example.com:8080',
    'https://example.com:80',
    'http://localhost',
    'http://localhost.',
    'http://app.localhost',
    'http://pc.local',
    'http://metadata.google.internal',
    'http://server',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::ffff:127.0.0.1]',
  ])('内部URLや特殊な接続指定を拒否する: %s', (url) => {
    expect(() => validatePublicSourceUrl(url)).toThrow();
  });

  it('標準ポートを許可し、URLのフラグメントを送らない', () => {
    expect(validatePublicSourceUrl('https://example.com:443/page?q=1#heading').href).toBe(
      'https://example.com/page?q=1',
    );
    expect(validatePublicSourceUrl('http://example.com:80/page').port).toBe('');
  });

  it('DNSの回答をすべて検査し、1件でも内部IPがあれば接続しない', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '93.184.215.14', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    await expect(readPublicSourceUrl('https://example.com')).rejects.toThrow('社内ネットワーク');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('接続先IPをDNS検査時の値に固定し、Cookieや認証情報を送らない', async () => {
    const result = await readPublicSourceUrl('https://example.com/material#chapter');
    expect(result.bytes.toString()).toBe('<p>資料</p>');
    expect(result.contentType).toBe('text/html');
    expect(result.url).toBe('https://example.com/material');
    expect(mocks.lookup).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
    const options = mocks.request.mock.calls[0][1] as RequestOptions;
    expect(options.agent).toBe(false);
    expect(options.family).toBe(4);
    const callback = vi.fn();
    options.lookup!('example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.215.14', 4);
    options.lookup!('example.com', { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: '93.184.215.14', family: 4 }], 4);
    expect(options.headers).toEqual(expect.objectContaining({ 'Accept-Encoding': 'identity' }));
    expect(Object.keys(options.headers!).map((name) => name.toLowerCase())).not.toContain('cookie');
    expect(Object.keys(options.headers!).map((name) => name.toLowerCase())).not.toContain(
      'authorization',
    );
  });

  it('各転送先をDNSから再検査し、内部IPへの転送を拒否する', async () => {
    plans.push({ status: 302, headers: { location: 'https://another.example.com/secret' } });
    mocks.lookup
      .mockResolvedValueOnce([{ address: '93.184.215.14', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    await expect(readPublicSourceUrl('https://example.com')).rejects.toThrow('社内ネットワーク');
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(responses[0].destroyed).toBe(true);
  });

  it('相対転送先を解決し、最大3回の転送まで取得できる', async () => {
    plans.push(...[1, 2, 3].map((i) => ({ status: 302, headers: { location: `/page${i}` } })));
    const result = await readPublicSourceUrl('https://example.com/start');
    expect(result.url).toBe('https://example.com/page3');
    expect(mocks.request).toHaveBeenCalledTimes(4);
  });

  it('4回目の転送では次の接続を作らない', async () => {
    plans.push(...[1, 2, 3, 4].map((i) => ({ status: 302, headers: { location: `/page${i}` } })));
    await expect(readPublicSourceUrl('https://example.com')).rejects.toThrow('転送が多すぎる');
    expect(mocks.request).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['text/plain', 'identity'],
    ['text/markdown', 'identity'],
    ['text/csv', 'identity'],
    ['application/pdf', 'identity'],
  ])('対応している資料を受け取れる: %s', async (contentType, encoding) => {
    plans.push({ headers: { 'content-type': contentType, 'content-encoding': encoding } });
    expect((await readPublicSourceUrl('https://example.com')).contentType).toBe(contentType);
  });

  it.each([
    [{ 'content-type': 'image/png' }, 'ファイル形式'],
    [{ 'content-type': 'application/octet-stream' }, 'ファイル形式'],
    [
      { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      'ファイル形式',
    ],
    [
      {
        'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      'ファイル形式',
    ],
    [{ 'content-encoding': 'gzip' }, '圧縮'],
    [{ 'content-length': String(5 * 1024 * 1024 + 1) }, '5MB'],
  ])('未対応形式・圧縮・大きすぎる資料は本文を読まず切断する', async (headers, message) => {
    plans.push({ headers });
    await expect(readPublicSourceUrl('https://example.com')).rejects.toThrow(message);
    expect(responses[0].destroyed).toBe(true);
  });

  it('Content-Lengthなしの応答も5MBで読み込みを打ち切る', async () => {
    plans.push({ chunks: [Buffer.alloc(5 * 1024 * 1024), Buffer.from('x')] });
    await expect(readPublicSourceUrl('https://example.com')).rejects.toThrow('5MB');
    expect(responses[0].destroyed).toBe(true);
  });

  it('DNSが応答しない場合も全体で15秒で終了する', async () => {
    vi.useFakeTimers();
    mocks.lookup.mockImplementation(() => new Promise(() => {}));
    const result = expect(readPublicSourceUrl('https://example.com')).rejects.toThrow(
      '時間がかかっています',
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('本文を読み込んでいる途中でも利用者の中止を受け付ける', async () => {
    plans.push({ pending: true });
    const controller = new AbortController();
    const result = expect(
      readPublicSourceUrl('https://example.com', controller.signal),
    ).rejects.toThrow('中止しました');
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    controller.abort();
    await result;
  });

  it('本文の応答が終わらない場合も全体で15秒で終了する', async () => {
    vi.useFakeTimers();
    plans.push({ pending: true });
    const result = expect(readPublicSourceUrl('https://example.com')).rejects.toThrow(
      '時間がかかっています',
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
  });

  it('すでに中止された要求ではDNSやHTTP接続を開始しない', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readPublicSourceUrl('https://example.com', controller.signal)).rejects.toThrow(
      '中止しました',
    );
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('接続失敗の内部情報を利用者向けエラーに含めない', async () => {
    mocks.lookup.mockRejectedValue(new Error('private DNS details'));
    await expect(readPublicSourceUrl('https://example.com')).rejects.toThrow(
      'URLから資料を読み込めませんでした',
    );
  });
});

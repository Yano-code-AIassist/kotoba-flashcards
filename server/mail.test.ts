import { afterEach, expect, it, vi } from 'vitest';
import { createMailer } from './mail';
import type { ServerConfig } from './config';

const config: ServerConfig = {
  origin: 'https://kotoba.example.com',
  secret: 'test-only',
  databasePath: ':memory:',
  production: true,
  resend: { apiKey: 'test-private-key', from: 'kotoba@example.test' },
};
const brevoConfig: ServerConfig = {
  origin: 'https://kotoba.example.com',
  secret: 'test-only',
  databasePath: ':memory:',
  production: true,
  brevo: {
    apiKey: 'test-brevo-key',
    fromEmail: 'sender@example.test',
    fromName: 'Kotoba Test',
  },
};
afterEach(() => vi.unstubAllGlobals());
it('HTTPSメールAPIへ必要な内容を送り、正常な送信結果を検証する', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'test-mail-id' })));
  vi.stubGlobal('fetch', request);
  await createMailer(config)!.send('user@example.test', 'メール確認', '確認URL');
  expect(request).toHaveBeenCalledTimes(1);
  const [url, options] = request.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(options.headers.Authorization).toBe('Bearer test-private-key');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options.body)).toEqual({
    from: 'kotoba@example.test',
    to: ['user@example.test'],
    subject: 'メール確認',
    text: '確認URL',
  });
});
it('送信エラー・不正な応答を成功扱いせず、秘密をエラーに含めない', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response('private-provider-details', { status: 403 }))
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', request);
  const mailer = createMailer(config)!;
  await expect(mailer.send('user@example.test', '確認', '本文')).rejects.toThrow(
    '確認メールを送信できませんでした。',
  );
  await expect(mailer.send('user@example.test', '確認', '本文')).rejects.toThrow(
    'メール送信の結果を確認できませんでした。',
  );
});
it('BrevoのHTTPS APIへ確認メールを送り、正常な送信結果を検証する', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ messageId: 'test-message-id' })));
  vi.stubGlobal('fetch', request);
  await createMailer(brevoConfig)!.send('user@example.test', 'メール確認', '確認URL');
  expect(request).toHaveBeenCalledTimes(1);
  const [url, options] = request.mock.calls[0];
  expect(url).toBe('https://api.brevo.com/v3/smtp/email');
  expect(options.headers['api-key']).toBe('test-brevo-key');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options.body)).toEqual({
    sender: { email: 'sender@example.test', name: 'Kotoba Test' },
    to: [{ email: 'user@example.test' }],
    subject: 'メール確認',
    textContent: '確認URL',
  });
});
it('Brevoの送信エラー・不正な応答を成功扱いしない', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response('private-provider-details', { status: 403 }))
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', request);
  const mailer = createMailer(brevoConfig)!;
  await expect(mailer.send('user@example.test', '確認', '本文')).rejects.toThrow(
    '確認メールを送信できませんでした。',
  );
  await expect(mailer.send('user@example.test', '確認', '本文')).rejects.toThrow(
    'メール送信の結果を確認できませんでした。',
  );
});

import { describe, expect, it } from 'vitest';
import { mobileAccessUrl } from './mobileAccess';
import { readConfig } from './config';

describe('スマホ用URLと公開設定', () => {
  it.each([
    'http://127.0.0.1:5173',
    'https://localhost',
    'https://localhost.',
    'https://x.localhost',
    'https://192.168.1.5',
    'https://10.0.0.1',
    'https://[::1]',
    'https://pc.local',
    'https://pc.internal',
    'http://kotoba.example.com',
    'https://user:secret@kotoba.example.com',
  ])('スマホで使えないURLをQRにしない: %s', (url) => {
    expect(mobileAccessUrl(url)).toBeNull();
  });
  it('公開トップURLだけを使い、再設定トークンや画面・アカウント情報を含めない', () => {
    expect(mobileAccessUrl('https://kotoba.example.com/?token=secret#/decks/private')).toBe(
      'https://kotoba.example.com/',
    );
  });
  it('Resendでも公開用のメール確認を構成でき、未設定・片側のみは拒否する', () => {
    const env = {
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://kotoba.example.com',
      BETTER_AUTH_SECRET: 'test-secret-12345678901234567890123456789',
    };
    expect(() => readConfig(env)).toThrow(/SMTP.*Resend/);
    expect(() => readConfig({ ...env, RESEND_API_KEY: 'test-key' })).toThrow(/MAIL_FROM/);
    expect(() => readConfig({ ...env, MAIL_FROM: 'test@example.test' })).toThrow(/RESEND_API_KEY/);
    const configured = { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'test@example.test' };
    expect(readConfig(configured).resend).toEqual({
      apiKey: 'test-key',
      from: 'test@example.test',
    });
    expect(() =>
      readConfig({ ...configured, SMTP_HOST: 'mail.example.test', SMTP_FROM: 'test@example.test' }),
    ).toThrow(/どちらか/);
  });
});

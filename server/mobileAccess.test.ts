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
  it('HTTPSメールAPIを構成でき、未設定・片側のみ・複数指定は拒否する', () => {
    const env = {
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://kotoba.example.com',
      BETTER_AUTH_SECRET: 'test-secret-12345678901234567890123456789',
    };
    expect(() => readConfig(env)).toThrow(/SMTP.*Resend.*Brevo/);
    expect(() => readConfig({ ...env, RESEND_API_KEY: 'test-key' })).toThrow(/MAIL_FROM/);
    expect(() => readConfig({ ...env, MAIL_FROM: 'test@example.test' })).toThrow(/RESEND_API_KEY/);
    const configured = { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'test@example.test' };
    expect(readConfig(configured).resend).toEqual({
      apiKey: 'test-key',
      from: 'test@example.test',
    });
    expect(() =>
      readConfig({ ...configured, SMTP_HOST: 'mail.example.test', SMTP_FROM: 'test@example.test' }),
    ).toThrow(/いずれか一つ/);
    expect(() => readConfig({ ...env, BREVO_API_KEY: 'test-key' })).toThrow(/BREVO_FROM_EMAIL/);
    expect(() => readConfig({ ...env, BREVO_FROM_EMAIL: 'sender@example.test' })).toThrow(
      /BREVO_API_KEY/,
    );
    const brevoConfigured = {
      ...env,
      BREVO_API_KEY: 'test-key',
      BREVO_FROM_EMAIL: 'sender@example.test',
      BREVO_FROM_NAME: 'Kotoba Test',
    };
    expect(readConfig(brevoConfigured).brevo).toEqual({
      apiKey: 'test-key',
      fromEmail: 'sender@example.test',
      fromName: 'Kotoba Test',
    });
    expect(() => readConfig({ ...configured, ...brevoConfigured })).toThrow(/いずれか一つ/);
  });
});

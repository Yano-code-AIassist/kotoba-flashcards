import nodemailer from 'nodemailer';
import type { ServerConfig } from './config';

export function createMailer(config: ServerConfig) {
  if (config.resend) {
    const { apiKey, from } = config.resend;
    return {
      async send(to: string, subject: string, text: string) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('確認メールを送信できませんでした。');
        const result: unknown = await response.json();
        if (
          typeof result !== 'object' ||
          result === null ||
          !('id' in result) ||
          typeof result.id !== 'string' ||
          !result.id
        )
          throw new Error('メール送信の結果を確認できませんでした。');
      },
      close() {},
    };
  }
  if (config.brevo) {
    const { apiKey, fromEmail, fromName } = config.brevo;
    return {
      async send(to: string, subject: string, text: string) {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { email: fromEmail, name: fromName },
            to: [{ email: to }],
            subject,
            textContent: text,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('確認メールを送信できませんでした。');
        const result: unknown = await response.json();
        if (
          typeof result !== 'object' ||
          result === null ||
          !('messageId' in result) ||
          typeof result.messageId !== 'string' ||
          !result.messageId
        )
          throw new Error('メール送信の結果を確認できませんでした。');
      },
      close() {},
    };
  }
  if (!config.smtp) return null;
  const { smtp } = config;
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  return {
    async send(to: string, subject: string, text: string) {
      await transport.sendMail({ from: smtp.from, to, subject, text });
    },
    close() {
      transport.close();
    },
  };
}

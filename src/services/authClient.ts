import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  sessionOptions: { refetchInterval: 60, refetchOnWindowFocus: true },
});

export interface AuthConfig {
  google: boolean;
  line: boolean;
  emailVerification: boolean;
  passwordReset: boolean;
}

export function authError(code?: string) {
  const messages: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: 'メールアドレスまたはパスワードが違います。',
    EMAIL_NOT_VERIFIED: 'メールに届いた確認リンクを開いてからログインしてください。',
    USER_ALREADY_EXISTS: 'このメールアドレスは登録済みです。ログインしてください。',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
      'このメールアドレスは登録済みです。ログインしてください。',
    PASSWORD_TOO_SHORT: 'パスワードは10文字以上で入力してください。',
    INVALID_TOKEN: 'リンクが無効、または期限切れです。もう一度メールを送信してください。',
    TOO_MANY_REQUESTS: '操作が多すぎます。少し時間をおいてお試しください。',
    EMAIL_MISMATCH: '登録したメールアドレスと一致するアカウントを選択してください。',
    ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER: 'このログイン方法は別のアカウントで使われています。',
  };
  return (
    messages[code || ''] ||
    '認証できませんでした。入力内容や接続を確認して、もう一度お試しください。'
  );
}

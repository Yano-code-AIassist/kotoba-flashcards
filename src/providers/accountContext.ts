import { createContext, useContext } from 'react';
import type { AuthConfig } from '../services/authClient';

export interface AccountInfo {
  user: { id: string; name: string; email: string };
  config: AuthConfig;
}
export const AccountContext = createContext<AccountInfo | null>(null);
export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error('アカウント情報を取得できません。');
  return account;
}

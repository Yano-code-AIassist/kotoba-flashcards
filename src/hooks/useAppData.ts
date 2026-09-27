import { useContext } from 'react';
import { AppContext } from '../providers/appContext';

export function useAppData() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppDataはAppProviderの内側で使用してください。');
  }
  return context;
}

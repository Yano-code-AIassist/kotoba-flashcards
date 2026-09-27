import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { registerNavigationGuard } from '../services/navigation';

export function useUnsavedChanges(isDirty: boolean, onDiscard?: () => void) {
  const dirtyRef = useRef(isDirty);
  const discardRef = useRef(onDiscard);

  useLayoutEffect(() => {
    dirtyRef.current = isDirty;
    discardRef.current = onDiscard;
  }, [isDirty, onDiscard]);

  useEffect(
    () =>
      registerNavigationGuard(() => {
        if (!dirtyRef.current) return true;
        if (!window.confirm('入力中の変更は保存されていません。変更を破棄して移動しますか？'))
          return false;
        // 別ページへ移る直前のbeforeunloadで、同じ内容を二重に確認しない。
        dirtyRef.current = false;
        discardRef.current?.();
        return true;
      }),
    [],
  );

  useEffect(() => {
    if (!isDirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  // 保存後の画面更新を待たずに解除するため、成功直後の移動でも警告が出ない。
  const markSaved = useCallback(() => {
    dirtyRef.current = false;
  }, []);
  return { markSaved };
}

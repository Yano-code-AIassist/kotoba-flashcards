import { useEffect, useRef, useState } from 'react';
import { useAppData } from '../../hooks/useAppData';

export function StudySwipeControl() {
  const { data, isSaving, hasExternalChanges, setSwipeEnabled } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function toggle() {
    if (pending.current || isSaving || hasExternalChanges) return;
    pending.current = true;
    setError(null);
    try {
      const result = await setSwipeEnabled(!data.settings.swipeEnabled);
      if (!result.ok) setError(result.error.message);
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="study-swipe-control">
      <div className="study-swipe-control-row">
        <span>ボタンでも回答できます</span>
        <button
          type="button"
          role="switch"
          aria-label="スワイプ操作"
          aria-checked={data.settings.swipeEnabled}
          disabled={isSaving || hasExternalChanges}
          onClick={() => void toggle()}
        >
          スワイプ
          <span className="study-switch-track" aria-hidden="true">
            <span />
          </span>
          <span aria-hidden="true">{data.settings.swipeEnabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert" ref={errorRef} tabIndex={-1}>
          {error}
        </p>
      )}
    </div>
  );
}

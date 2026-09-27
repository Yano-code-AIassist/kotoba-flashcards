import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { StudyRating } from '../types/domain';
import {
  canStartSwipe,
  getSwipeRating,
  moveSwipeGesture,
  startSwipeGesture,
} from '../utils/swipeGesture';
import type { SwipeGesture } from '../utils/swipeGesture';

interface ActiveSwipe {
  pointerId: number;
  element: HTMLButtonElement;
  armed: boolean;
  gesture: SwipeGesture;
}

function releasePointer(active: ActiveSwipe) {
  if (active.element.hasPointerCapture(active.pointerId)) {
    active.element.releasePointerCapture(active.pointerId);
  }
}

export function useCardSwipe({
  enabled,
  onSwipe,
  onTap,
  onBlockClick,
}: {
  enabled: boolean;
  onSwipe: (rating: StudyRating) => void;
  onTap: () => void;
  onBlockClick: () => void;
}) {
  const activeRef = useRef<ActiveSwipe | null>(null);
  const [preview, setPreview] = useState<SwipeGesture | null>(null);
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    setPreview(null);
  }
  useLayoutEffect(() => {
    // 保存開始や設定変更をまたいだ指の動きでは、回答を確定しない。
    if (activeRef.current) activeRef.current.armed = false;
  }, [enabled]);

  const cancel = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    onBlockClick();
    releasePointer(active);
    setPreview(null);
  }, [onBlockClick]);

  useEffect(() => {
    const onOtherPointer = (event: PointerEvent) => {
      if (activeRef.current && event.pointerId !== activeRef.current.pointerId) cancel();
    };
    const onVisibility = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener('pointerdown', onOtherPointer, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointerdown', onOtherPointer, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
      const active = activeRef.current;
      activeRef.current = null;
      if (active) releasePointer(active);
    };
  }, [cancel]);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || !['touch', 'pen'].includes(event.pointerType)) {
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    const armed = enabled && canStartSwipe(point, window.innerWidth, window.innerHeight);
    activeRef.current = {
      pointerId: event.pointerId,
      element: event.currentTarget,
      armed,
      gesture: startSwipeGesture(point),
    };
    setPreview(null);
    // カードから指が少し外れても、同じ操作の終了まで受け取る。
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = activeRef.current;
    if (!active || event.pointerId !== active.pointerId) return;
    active.gesture = moveSwipeGesture(active.gesture, { x: event.clientX, y: event.clientY });
    if (active.gesture.moved) onBlockClick();
    setPreview(
      active.armed && enabled && active.gesture.phase === 'horizontal' ? active.gesture : null,
    );
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = activeRef.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const gesture = moveSwipeGesture(active.gesture, { x: event.clientX, y: event.clientY });
    // lostpointercaptureより先に解除し、一度の動作を二重に処理しない。
    activeRef.current = null;
    releasePointer(active);
    setPreview(null);
    if (gesture.moved) onBlockClick();
    const rating = getSwipeRating(gesture);
    if (active.armed && enabled && rating) onSwipe(rating);
    // 連続するタッチではブラウザーがclickを省くことがあるため、動かなかった指は
    // pointerupでもタップとして扱う。答え表示は何度呼んでも同じ状態になる。
    if (!gesture.moved) onTap();
  }

  return {
    preview,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
    },
  };
}

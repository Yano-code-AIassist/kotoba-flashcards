import type { StudyRating } from '../types/domain';

export const SWIPE_DISTANCE = 80;
const DIRECTION_RATIO = 1.5;
const MOVEMENT_SLOP = 10;
const EDGE_MARGIN = 24;

export interface SwipePoint {
  x: number;
  y: number;
}

export interface SwipeGesture {
  start: SwipePoint;
  dx: number;
  dy: number;
  moved: boolean;
  phase: 'pending' | 'horizontal' | 'cancelled';
}

export function canStartSwipe(point: SwipePoint, width: number, height: number): boolean {
  // 画面端からのブラウザーの戻る操作などを、回答として扱わない。
  return (
    point.x >= EDGE_MARGIN &&
    point.x <= width - EDGE_MARGIN &&
    point.y >= EDGE_MARGIN &&
    point.y <= height - EDGE_MARGIN
  );
}

export function startSwipeGesture(start: SwipePoint): SwipeGesture {
  return { start, dx: 0, dy: 0, moved: false, phase: 'pending' };
}

export function moveSwipeGesture(gesture: SwipeGesture, point: SwipePoint): SwipeGesture {
  const dx = point.x - gesture.start.x;
  const dy = point.y - gesture.start.y;
  const moved = gesture.moved || Math.max(Math.abs(dx), Math.abs(dy)) >= MOVEMENT_SLOP;
  let phase = gesture.phase;
  if (phase !== 'cancelled' && Math.max(Math.abs(dx), Math.abs(dy)) >= MOVEMENT_SLOP) {
    // 縦・斜めに動き始めた操作は、後から横へ曲がっても回答にしない。
    phase = Math.abs(dx) >= Math.abs(dy) * DIRECTION_RATIO ? 'horizontal' : 'cancelled';
  }
  return { ...gesture, dx, dy, moved, phase };
}

export function getSwipeRating(gesture: SwipeGesture): StudyRating | null {
  if (
    gesture.phase !== 'horizontal' ||
    Math.abs(gesture.dx) < SWIPE_DISTANCE ||
    Math.abs(gesture.dx) < Math.abs(gesture.dy) * DIRECTION_RATIO
  ) {
    return null;
  }
  return gesture.dx < 0 ? 'learning' : 'remembered';
}

import { describe, expect, it } from 'vitest';
import { canStartSwipe, getSwipeRating, moveSwipeGesture, startSwipeGesture } from './swipeGesture';

function move(dx: number, dy = 0) {
  return moveSwipeGesture(startSwipeGesture({ x: 150, y: 300 }), { x: 150 + dx, y: 300 + dy });
}

describe('回答スワイプの判定', () => {
  it.each([
    [79, 0, null],
    [-79, 0, null],
    [80, 0, 'remembered'],
    [-80, 0, 'learning'],
    [120, 80, 'remembered'],
    [-120, -80, 'learning'],
    [120, 81, null],
    [0, 150, null],
    [9, 9, null],
    [0, 0, null],
  ])('移動量(%s, %s)の回答は%s', (dx, dy, expected) => {
    expect(getSwipeRating(move(Number(dx), Number(dy)))).toBe(expected);
  });
  it('縦スクロール開始後に横へ動いても確定しない', () => {
    const vertical = move(2, 20);
    expect(getSwipeRating(moveSwipeGesture(vertical, { x: 300, y: 300 }))).toBeNull();
  });
  it('横から縦に方向を変えた場合もキャンセルする', () => {
    const horizontal = move(90);
    const cancelled = moveSwipeGesture(horizontal, { x: 240, y: 450 });
    expect(getSwipeRating(cancelled)).toBeNull();
    expect(getSwipeRating(moveSwipeGesture(cancelled, { x: 300, y: 300 }))).toBeNull();
  });
  it('指を元へ戻せば回答を取り消せるが、タップにはならない', () => {
    const back = moveSwipeGesture(move(100), { x: 150, y: 300 });
    expect(getSwipeRating(back)).toBeNull();
    expect(back.moved).toBe(true);
  });
  it('最終的に移動した方向で回答し、元の状態は変更しない', () => {
    const before = move(100);
    const after = moveSwipeGesture(before, { x: 50, y: 300 });
    expect(getSwipeRating(after)).toBe('learning');
    expect(getSwipeRating(before)).toBe('remembered');
  });
  it.each([
    [23, 100],
    [297, 100],
    [100, 23],
    [100, 617],
    [-1, 100],
    [NaN, 100],
  ])('画面端や無効な座標(%s, %s)からは開始しない', (x, y) => {
    expect(canStartSwipe({ x, y }, 320, 640)).toBe(false);
  });
  it.each([
    [24, 24],
    [296, 616],
    [160, 320],
  ])('画面内(%s, %s)から開始できる', (x, y) => {
    expect(canStartSwipe({ x, y }, 320, 640)).toBe(true);
  });
});

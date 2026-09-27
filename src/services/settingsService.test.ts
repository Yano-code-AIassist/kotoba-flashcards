import { describe, expect, it } from 'vitest';
import { storedDataFixture } from '../test/storedDataFixture';
import { saveSettingsInData, setSwipeEnabledInData } from './settingsService';
import type { AppSettings, StudyMode } from '../types/domain';

describe('設定の保存', () => {
  it.each<StudyMode>(['all', 'unlearned', 'learning', 'random'])(
    '%sとスワイプを一緒に変更し、教材と途中の学習を維持する',
    (defaultStudyMode) => {
      const data = storedDataFixture();
      const original = structuredClone(data);
      const settings = { defaultStudyMode, swipeEnabled: true };
      const result = saveSettingsInData(data, settings);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('保存失敗');
      expect(result.value.data).toEqual({ ...original, settings });
      expect(data).toEqual(original);
      settings.swipeEnabled = false;
      expect(result.value.data.settings.swipeEnabled).toBe(true);
    },
  );
  it('不正な出題方法やboolean以外のスワイプ設定を拒否する', () => {
    const data = storedDataFixture();
    for (const invalid of [
      { defaultStudyMode: 'unknown', swipeEnabled: true },
      { defaultStudyMode: 'all', swipeEnabled: 'false' },
    ]) {
      expect(saveSettingsInData(data, invalid as AppSettings).ok).toBe(false);
    }
  });
  it('学習画面のスワイプ切り替えでは標準の出題方法を変えない', () => {
    const data = storedDataFixture();
    const result = setSwipeEnabledInData(data, true);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('保存失敗');
    expect(result.value.data.settings).toEqual({ defaultStudyMode: 'random', swipeEnabled: true });
    expect(result.value.data.activeSession).toEqual(data.activeSession);
    expect(data.settings.swipeEnabled).toBe(false);
  });
});

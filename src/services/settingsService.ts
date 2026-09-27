import type { AppData, AppSettings } from '../types/domain';
import type { Result } from '../types/storage';
import type { DataChange } from './deckService';
import { STUDY_MODES } from './studyService';

export function saveSettingsInData(data: AppData, settings: AppSettings): Result<DataChange<void>> {
  if (
    !STUDY_MODES.some((mode) => mode.value === settings.defaultStudyMode) ||
    typeof settings.swipeEnabled !== 'boolean'
  ) {
    return {
      ok: false,
      error: { code: 'validation', message: '出題方法とスワイプの設定を確認してください。' },
    };
  }
  // 設定だけを置き換え、保存済みの単語や途中の学習は変更しない。
  return { ok: true, value: { data: { ...data, settings: { ...settings } }, value: undefined } };
}

export function setSwipeEnabledInData(data: AppData, enabled: boolean): Result<DataChange<void>> {
  return saveSettingsInData(data, { ...data.settings, swipeEnabled: enabled });
}

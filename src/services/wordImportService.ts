import type { AppData, Word, WordInput } from '../types/domain';
import type { Result } from '../types/storage';
import type { DataChange } from './deckService';
import { folderExists } from './folderService';
import { getWordInputErrors, validateWordInput } from './wordService';
import { parseCsv } from './csvService';
import { MAX_IMPORT_CHARACTERS, MAX_IMPORT_ROWS } from './importLimits';
import { createId } from '../utils/createId';

export interface ImportRow {
  line: number;
  input: WordInput;
  errors: string[];
  duplicate: boolean;
}
export interface ImportPreview {
  rows: ImportRow[];
  errors: string[];
}
export interface ImportOutcome {
  created: number;
  skipped: number;
}
export type ImportFormat = 'paste' | 'csv';

export function wordContentKey(input: WordInput): string {
  return JSON.stringify([input.question.trim(), input.answer.trim(), input.note.trim()]);
}

export function previewWordImport(
  text: string,
  format: ImportFormat,
  hasHeader: boolean,
  existing: Word[],
): ImportPreview {
  if (text.length > MAX_IMPORT_CHARACTERS)
    return { rows: [], errors: ['入力は100万文字以下に分けてください。'] };
  if (text.includes('\0'))
    return {
      rows: [],
      errors: ['読み込めない文字が含まれています。テキスト形式を確認してください。'],
    };
  const parsed =
    format === 'csv'
      ? parseCsv(text)
      : {
          ok: true as const,
          value: text
            .replace(/^\uFEFF/, '')
            .split(/\r\n|\r|\n/)
            .map((line, index) => ({ line: index + 1, cells: line.split('|') }))
            .filter((row) => row.cells.length > 1 || row.cells[0].trim()),
        };
  if (!parsed.ok) return { rows: [], errors: [parsed.error.message] };
  const records = [...parsed.value];
  let columns: number | undefined;
  if (format === 'csv' && hasHeader) {
    const header = records.shift()?.cells.map((cell) => cell.trim().toLowerCase());
    if (
      !header ||
      ![2, 3].includes(header.length) ||
      !['問題', 'question'].includes(header[0]) ||
      !['答え', 'answer'].includes(header[1]) ||
      (header.length === 3 && !['補足説明', '補足', 'note'].includes(header[2]))
    ) {
      return {
        rows: [],
        errors: [
          '見出しは「問題,答え,補足説明」または「question,answer,note」の順にしてください。見出しがない場合はチェックを外してください。',
        ],
      };
    }
    columns = header.length;
  }
  if (records.length === 0)
    return { rows: [], errors: ['登録する単語がありません。問題と答えを入力してください。'] };
  if (records.length > MAX_IMPORT_ROWS)
    return {
      rows: [],
      errors: [`1回に取り込めるのは${MAX_IMPORT_ROWS}語までです。分けて登録してください。`],
    };
  const seen = new Set(existing.map(wordContentKey));
  const rows = records.map(({ cells, line }): ImportRow => {
    const input = {
      question: cells[0]?.trim() ?? '',
      answer: cells[1]?.trim() ?? '',
      note: cells[2]?.trim() ?? '',
    };
    const errors = Object.values(getWordInputErrors(input));
    if (![2, 3].includes(cells.length) || (columns !== undefined && cells.length !== columns))
      errors.unshift(
        columns
          ? `見出しと同じ${columns}列にしてください。`
          : '問題・答えの2項目、または補足を含む3項目にしてください。',
      );
    const key = wordContentKey(input);
    const duplicate = errors.length === 0 && seen.has(key);
    if (errors.length === 0) seen.add(key);
    return { line, input, errors, duplicate };
  });
  return { rows, errors: [] };
}

export function importWordsInData(
  data: AppData,
  deckId: string,
  inputs: WordInput[],
  skipDuplicates: boolean,
  expectedRevision: number,
  folderId: string | null = null,
): Result<DataChange<ImportOutcome>> {
  if (data.revision !== expectedRevision)
    return {
      ok: false,
      error: {
        code: 'conflict',
        message: '保存データが変わりました。もう一度プレビューしてください。',
      },
    };
  if (!folderExists(data, deckId, folderId))
    return { ok: false, error: { code: 'not-found', message: 'この単語帳が見つかりません。' } };
  if (inputs.length === 0 || inputs.length > MAX_IMPORT_ROWS)
    return {
      ok: false,
      error: {
        code: 'validation',
        message: `登録する単語は1〜${MAX_IMPORT_ROWS}語にしてください。`,
      },
    };
  const normalized: WordInput[] = [];
  const seen = new Set(
    data.words
      .filter((word) => word.deckId === deckId && (word.folderId ?? null) === folderId)
      .map(wordContentKey),
  );
  let skipped = 0;
  // 全行の検証を終えるまでデータを作り替えず、部分的な登録を防ぐ。
  for (let index = 0; index < inputs.length; index++) {
    const result = validateWordInput(inputs[index]);
    if (!result.ok)
      return {
        ok: false,
        error: { ...result.error, message: `${index + 1}件目：${result.error.message}` },
      };
    const key = wordContentKey(result.value);
    if (skipDuplicates && seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    normalized.push(result.value);
  }
  if (normalized.length === 0)
    return {
      ok: false,
      error: { code: 'validation', message: '重複を除くと追加する単語がありません。' },
    };
  const now = new Date().toISOString();
  const added: Word[] = normalized.map((input) => ({
    ...input,
    id: createId('word'),
    deckId,
    folderId,
    status: 'unlearned',
    lastStudiedAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  // 既存の単語・学習中の出題順は維持し、一度の保存で全件を追加する。
  return {
    ok: true,
    value: {
      data: { ...data, words: [...data.words, ...added] },
      value: { created: added.length, skipped },
    },
  };
}

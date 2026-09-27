import { describe, expect, it } from 'vitest';
import { csvFileName, decodeCsv, exportWordsCsv, parseCsv } from './csvService';
import { previewWordImport } from './wordImportService';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_CHARACTERS } from './importLimits';
import type { Result } from '../types/storage';
function ok<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('CSVの解析', () => {
  it('BOM・CRLF・引用符・カンマ・項目内改行と元の行番号を保持する', () => {
    expect(
      ok(parseCsv('\uFEFF問題,答え,補足説明\r\n"Q,1","A""1","行1\r\n行2"\r\n\r\nQ2,A2,\r\n')),
    ).toEqual([
      { line: 1, cells: ['問題', '答え', '補足説明'] },
      { line: 2, cells: ['Q,1', 'A"1', '行1\r\n行2'] },
      { line: 5, cells: ['Q2', 'A2', ''] },
    ]);
  });
  it.each(['\n', '\r', '\r\n'])('%jの行末と最終改行なしを扱う', (newline) => {
    expect(ok(parseCsv(`q,a${newline}q2,a2`))).toEqual([
      { line: 1, cells: ['q', 'a'] },
      { line: 2, cells: ['q2', 'a2'] },
    ]);
  });
  it.each(['"q,a', 'q"x,a', '"q"x,a', 'q,a,n,x,y'])('不正な引用符・列を拒否する：%s', (text) => {
    expect(parseCsv(text).ok).toBe(false);
  });
  it('空行と、空欄の項目がある行を区別する', () => {
    expect(ok(parseCsv(' \n\n,""\n""'))).toEqual([
      { line: 3, cells: ['', ''] },
      { line: 4, cells: [''] },
    ]);
  });
  it('過大な文字数・行数を途中で拒否する', () => {
    expect(parseCsv('a'.repeat(MAX_IMPORT_CHARACTERS + 1)).ok).toBe(false);
    expect(parseCsv('q,a\n'.repeat(503)).ok).toBe(false);
  });
});

describe('文字コードとCSV出力', () => {
  it('UTF-8 BOMとShift_JISの日本語を復号する', () => {
    expect(ok(decodeCsv(new TextEncoder().encode('\uFEFF問題,答え').buffer, 'utf-8'))).toBe(
      '問題,答え',
    );
    const sjis = Uint8Array.from([0x96, 0xe2, 0x91, 0xe8, 0x2c, 0x93, 0x9a, 0x82, 0xa6]);
    expect(ok(decodeCsv(sjis.buffer, 'shift_jis'))).toBe('問題,答え');
    expect(decodeCsv(sjis.buffer, 'utf-8').ok).toBe(false);
  });
  it('不正なバイト、NUL文字、過大なファイルを拒否する', () => {
    expect(decodeCsv(new Uint8Array([0xff]).buffer, 'utf-8').ok).toBe(false);
    expect(decodeCsv(new Uint8Array([0]).buffer, 'utf-8').ok).toBe(false);
    expect(decodeCsv(new ArrayBuffer(MAX_IMPORT_FILE_BYTES + 1), 'utf-8').ok).toBe(false);
  });
  it('空のCSVや空白・BOMだけのファイルは理由を表示して拒否する', () => {
    for (const text of ['', '\uFEFF \r\n']) {
      const result = decodeCsv(new TextEncoder().encode(text).buffer, 'utf-8');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('空です');
    }
  });
  it('日本語・カンマ・引用符・改行を出力して再取り込みできる', () => {
    const words = [{ question: '問題,"1"', answer: '答え\n  続き', note: '補足\r\n2行目' }];
    const csv = exportWordsCsv(words);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const preview = previewWordImport(csv, 'csv', true, []);
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((row) => row.input)).toEqual(words);
  });
  it.each(['=1+2', '+123', '-1', '@SUM(1)', '＝1+2', '＋1', '－1', '＠A1'])(
    '数式のような先頭%sを保護し、アプリへは元の本文として戻す',
    (value) => {
      const word = { question: value, answer: 'a', note: '' };
      const csv = exportWordsCsv([word]);
      expect(csv).toContain(`"\t${value}"`);
      expect(previewWordImport(csv, 'csv', true, []).rows[0].input).toEqual(word);
    },
  );
  it('ファイル名の禁止文字・制御文字・予約名を避ける', () => {
    expect(csvFileName('CON', false)).toBe('kotoba-CON.csv');
    expect(csvFileName('基本/情報:試験\n', true)).toBe('kotoba-基本_情報_試験_-表示中.csv');
    expect(csvFileName('....', false)).toBe('kotoba-単語帳.csv');
  });
});

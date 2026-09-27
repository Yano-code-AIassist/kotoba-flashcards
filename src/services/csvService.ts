import type { WordInput } from '../types/domain';
import type { Result } from '../types/storage';
import { MAX_IMPORT_CHARACTERS, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from './importLimits';

export interface TextRecord {
  line: number;
  cells: string[];
}
function invalid(message: string): Result<never> {
  return { ok: false, error: { code: 'validation', message } };
}

export function parseCsv(source: string): Result<TextRecord[]> {
  if (source.length > MAX_IMPORT_CHARACTERS)
    return invalid('CSVの文字数が多すぎます。100万文字以下に分けてください。');
  const text = source.replace(/^\uFEFF/, '');
  const rows: TextRecord[] = [];
  let cells: string[] = [];
  let value = '';
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  let line = 1;
  let rowLine = 1;
  let rowStart = 0;
  function endRow(end: number) {
    // 空行だけを無視する。「,」や「""」は入力された行として検証する。
    if (text.slice(rowStart, end).trim()) rows.push({ line: rowLine, cells: [...cells, value] });
    cells = [];
    value = '';
    state = 'start';
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (state === 'quoted') {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index++;
        } else state = 'closed';
      } else if (char === '\r' || char === '\n') {
        value += char;
        if (char === '\r' && text[index + 1] === '\n') value += text[++index];
        line++;
      } else value += char;
      continue;
    }
    if (char === ',') {
      cells.push(value);
      value = '';
      state = 'start';
      if (cells.length > 3)
        return invalid(`${rowLine}行目：列が多すぎます。問題・答え・補足の順にしてください。`);
    } else if (char === '\r' || char === '\n') {
      endRow(index);
      if (rows.length > MAX_IMPORT_ROWS + 1)
        return invalid(`1回に取り込めるのは${MAX_IMPORT_ROWS}語までです。`);
      if (char === '\r' && text[index + 1] === '\n') index++;
      line++;
      rowLine = line;
      rowStart = index + 1;
    } else if (char === '"') {
      if (state !== 'start')
        return invalid(`${line}行目：引用符の位置が不正です。項目全体を引用符で囲んでください。`);
      state = 'quoted';
    } else {
      if (state === 'closed')
        return invalid(`${line}行目：閉じた引用符の後に余分な文字があります。`);
      state = 'plain';
      value += char;
    }
  }
  if (state === 'quoted') return invalid(`${rowLine}行目からの引用符が閉じられていません。`);
  endRow(text.length);
  return { ok: true, value: rows };
}

export function decodeCsv(bytes: ArrayBuffer, encoding: 'utf-8' | 'shift_jis'): Result<string> {
  if (bytes.byteLength > MAX_IMPORT_FILE_BYTES)
    return invalid('CSVファイルは2MB以下に分けてください。');
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (!text.trim())
      return invalid('CSVファイルが空です。問題と答えを含むファイルを選んでください。');
    if (text.includes('\0'))
      return invalid(
        'CSVとして読めない文字があります。UTF-8またはShift_JISのCSVを選んでください。',
      );
    return { ok: true, value: text };
  } catch {
    return invalid(
      '選択した文字コードで読み込めません。UTF-8／Shift_JISの指定を確認してください。',
    );
  }
}

function csvCell(value: string): string {
  // 表計算ソフトの数式として解釈されやすい先頭文字には、引用符内にタブを加える。
  // 再取り込みでは共通のtrim処理で取り除くため、単語の本文は元の形に戻る。
  const safe = /^[=+\-@＝＋－＠]/u.test(value.trimStart()) ? `\t${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportWordsCsv(words: WordInput[]): string {
  const rows = [
    ['問題', '答え', '補足説明'],
    ...words.map((word) => [word.question, word.answer, word.note]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csvFileName(deckName: string, filtered: boolean): string {
  const name =
    Array.from(deckName, (char) => (char.charCodeAt(0) < 32 ? '_' : char))
      .join('')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 70) || '単語帳';
  // 固定の接頭辞でWindowsの予約名とも衝突しないようにする。
  return `kotoba-${name}${filtered ? '-表示中' : ''}.csv`;
}

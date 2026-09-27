import { describe, expect, it } from 'vitest';
import { evaluateAiSmoke } from './ai-smoke-quality.mjs';

const source = [
  'CPUは命令を解釈し、計算や制御を行う装置です。',
  '主記憶装置は、CPUが処理中のプログラムとデータを一時的に保持します。',
  'キャッシュメモリは、CPUと主記憶装置の速度差を補う高速な記憶装置です。',
  'OSは、ハードウェア資源を管理し、アプリケーションへ共通機能を提供します。',
  'IPアドレスは、ネットワーク上の機器を識別するための番号です。',
].join('');

function word(question, answer, evidence) {
  return {
    question,
    answer,
    note: `短い補足\n出典：貼り付けた資料\n資料内の根拠（AI抽出）：${evidence}`,
  };
}

describe('AI実接続スモークテストの品質判定', () => {
  it('5語・固有・全文根拠・重要語網羅なら合格する', () => {
    const words = [
      word('CPUとは何ですか？', 'CPU', 'CPUは命令を解釈し、計算や制御を行う装置です。'),
      word(
        '主記憶装置の役割は？',
        '主記憶装置',
        '主記憶装置は、CPUが処理中のプログラムとデータを一時的に保持します。',
      ),
      word(
        '速度差を補う装置は？',
        'キャッシュメモリ',
        'キャッシュメモリは、CPUと主記憶装置の速度差を補う高速な記憶装置です。',
      ),
      word(
        '資源を管理するものは？',
        'OS',
        'OSは、ハードウェア資源を管理し、アプリケーションへ共通機能を提供します。',
      ),
      word(
        '機器を識別する番号は？',
        'IPアドレス',
        'IPアドレスは、ネットワーク上の機器を識別するための番号です。',
      ),
    ];
    expect(
      evaluateAiSmoke(
        words,
        source,
        ['CPU', '主記憶装置', 'キャッシュメモリ', 'OS', 'IPアドレス'],
        5,
      ).passed,
    ).toBe(true);
  });

  it('資料にない引用と不足語を不合格にする', () => {
    const words = [word('CPUとは？', 'CPU', '資料にはない説明です。')];
    const result = evaluateAiSmoke(words, source, ['CPU', 'OS'], 5);
    expect(result.passed).toBe(false);
    expect(result.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual([
      '指定数',
      '引用根拠',
      '重要語の網羅',
    ]);
  });
});

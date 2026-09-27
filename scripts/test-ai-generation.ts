import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAiWords, validateAiRequest } from '../server/aiGeneration';
import { evaluateAiSmoke } from './ai-smoke-quality.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');

const requestedCount = 5;
const expectedConcepts = ['CPU', '主記憶装置', 'キャッシュメモリ', 'OS', 'IPアドレス'];
const sourceText = [
  'CPUは命令を解釈し、計算や制御を行う装置です。',
  '主記憶装置は、CPUが処理中のプログラムとデータを一時的に保持します。',
  'キャッシュメモリは、CPUと主記憶装置の速度差を補う高速な記憶装置です。',
  'OSは、ハードウェア資源を管理し、アプリケーションへ共通機能を提供します。',
  'IPアドレスは、ネットワーク上の機器を識別するための番号です。',
].join('');
const request = validateAiRequest({
  source: { kind: 'text', text: sourceText },
  count: requestedCount,
});
const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.log('AIテスト入力を検証しました。');
  console.log(`文字数: ${sourceText.length} / 生成数: ${request.count}語`);
  console.log(`確認する重要語: ${expectedConcepts.join('、')}`);
  process.exit(0);
}

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey)
  throw new Error(
    'GEMINI_API_KEYが未設定です。Google AI Studioでキーを作成し、.envへ設定してから再実行してください。',
  );
const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) throw new Error('GEMINI_MODELの形式が不正です。');

const startedAt = Date.now();
const result = await generateAiWords(
  {
    provider: 'gemini',
    apiKey,
    model,
    userDailyLimit: 1,
    globalDailyLimit: 1,
  },
  request,
);
const evaluation = evaluateAiSmoke(result.words, sourceText, expectedConcepts, requestedCount);
const report = {
  testedAt: new Date().toISOString(),
  model,
  durationMs: Date.now() - startedAt,
  sourceText,
  requestedCount,
  words: result.words,
  warnings: result.warnings,
  evaluation,
};
mkdirSync(resolve('.artifacts'), { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const reportPath = resolve('.artifacts', `ai-smoke-${stamp}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });

console.log(`実Geminiで${result.words.length}語を生成しました: ${model}`);
for (const check of evaluation.checks)
  console.log(`${check.ok ? '合格' : '不合格'}: ${check.name} — ${check.detail}`);
console.log(`結果: ${evaluation.passed ? '合格' : '要確認'}`);
console.log(`レポート: ${reportPath}`);
if (!evaluation.passed) process.exitCode = 1;

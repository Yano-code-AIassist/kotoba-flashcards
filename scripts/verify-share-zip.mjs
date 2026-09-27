import { resolve } from 'node:path';
import { readZipEntries, verifyShareEntries } from './share-package.mjs';

const input = process.argv[2];
if (!input)
  throw new Error('検証するZIPを指定してください。例: npm run share:verify -- .artifacts/xxx.zip');
const archive = resolve(input);
const result = verifyShareEntries(readZipEntries(archive));
console.log(`共有用ZIPを検証しました: ${archive}`);
console.log(`安全なソースファイル: ${result.fileCount}件`);

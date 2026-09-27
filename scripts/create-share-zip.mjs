import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  collectShareFiles,
  createZip,
  defaultShareZipName,
  findSensitiveContent,
  readZipEntries,
  sha256,
  verifyShareEntries,
} from './share-package.mjs';

const root = process.cwd();
const createdAt = new Date();
const output = resolve(
  process.argv[2] || '.artifacts',
  process.argv[2] ? '' : defaultShareZipName(createdAt),
);
if (existsSync(output) || existsSync(`${output}.sha256`))
  throw new Error(`出力先がすでに存在します。別の名前を指定してください: ${output}`);
const files = collectShareFiles(root);
const findings = [];
const entries = files.map((file) => {
  const data = readFileSync(file.absolute);
  findings.push(...findSensitiveContent(file.path, data));
  return { path: file.path, data };
});
if (findings.length)
  throw new Error(`共有対象から秘密情報らしい内容を検出しました。\n${findings.join('\n')}`);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const manifest = {
  archiveType: 'source-only',
  project: packageJson.name,
  version: packageJson.version,
  createdAt: createdAt.toISOString(),
  containsDatabase: false,
  containsSecrets: false,
  excluded: ['.env', '.data', '.backups', 'SQLite', 'auth-secret', 'node_modules', 'build', 'dist'],
  files: entries.map((entry) => ({
    path: entry.path,
    bytes: entry.data.length,
    sha256: sha256(entry.data),
  })),
};
entries.push({
  path: 'SHARE-MANIFEST.json',
  data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
});

mkdirSync(dirname(output), { recursive: true });
try {
  createZip(entries, output, createdAt);
  const result = verifyShareEntries(readZipEntries(output));
  const digest = sha256(readFileSync(output));
  writeFileSync(`${output}.sha256`, `${digest}  ${output.split(/[\\/]/).at(-1)}\n`, { flag: 'wx' });
  console.log(`共有用ZIPを作成しました: ${output}`);
  console.log(`検証済み: ${result.fileCount}ファイル、DB・秘密情報なし`);
  console.log(`SHA-256: ${digest}`);
} catch (error) {
  rmSync(output, { force: true });
  rmSync(`${output}.sha256`, { force: true });
  throw error;
}

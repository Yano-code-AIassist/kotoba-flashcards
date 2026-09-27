import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = process.argv[2];
if (!input) throw new Error('検証するバックアップフォルダーを指定してください。');
const root = resolve(input);
const manifestPath = resolve(root, 'backup-manifest.json');
if (!existsSync(manifestPath)) throw new Error('backup-manifest.jsonが見つかりません。');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.backupType !== 'private-sqlite') throw new Error('SQLiteバックアップではありません。');
if (manifest.databaseFile !== 'kotoba.sqlite') throw new Error('バックアップのDB名が不正です。');
const databasePath = resolve(root, manifest.databaseFile);
const databaseData = readFileSync(databasePath);
const hash = createHash('sha256').update(databaseData).digest('hex');
if (hash !== manifest.databaseSha256) throw new Error('DBのSHA-256が一致しません。');

const database = new DatabaseSync(databasePath, { readOnly: true });
try {
  const integrity = database.prepare('PRAGMA integrity_check').get()?.integrity_check;
  if (integrity !== 'ok') throw new Error(`SQLite整合性検査に失敗しました: ${String(integrity)}`);
  for (const [table, expected] of Object.entries(manifest.rowCounts ?? {})) {
    const quoted = table.replaceAll('"', '""');
    const actual = Number(
      database.prepare(`SELECT COUNT(*) AS count FROM "${quoted}"`).get()?.count,
    );
    if (actual !== expected) throw new Error(`${table}の件数が一致しません。`);
  }
} finally {
  database.close();
}
if (manifest.authSecret === 'included') {
  const secret = readFileSync(resolve(root, 'auth-secret'));
  const secretHash = createHash('sha256').update(secret).digest('hex');
  if (secretHash !== manifest.authSecretSha256)
    throw new Error('認証シークレットのSHA-256が一致しません。');
}
console.log(`バックアップを検証しました: ${root}`);
console.log(`SQLite整合性: ok / SHA-256: ${hash}`);

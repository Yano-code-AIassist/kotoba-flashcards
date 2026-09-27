import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.DATABASE_URL)
  throw new Error(
    'DATABASE_URLが設定されています。PostgreSQLは提供元のバックアップ機能またはpg_dumpを使用してください。',
  );

const source = resolve(process.argv[2] || process.env.DATABASE_PATH || '.data/kotoba.sqlite');
const outputRoot = resolve(process.argv[3] || '.backups');
if (!existsSync(source)) throw new Error(`SQLiteデータベースが見つかりません: ${source}`);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
let target = resolve(outputRoot, `kotoba-backup-${stamp}`);
let suffix = 2;
while (existsSync(target)) target = resolve(outputRoot, `kotoba-backup-${stamp}-${suffix++}`);
if (!target.startsWith(`${outputRoot}${process.platform === 'win32' ? '\\' : '/'}`))
  throw new Error('バックアップ先が不正です。');

mkdirSync(target, { recursive: true, mode: 0o700 });
const databaseTarget = resolve(target, 'kotoba.sqlite');
let sourceDatabase;
let backupDatabase;
try {
  sourceDatabase = new DatabaseSync(source);
  sourceDatabase.exec('PRAGMA busy_timeout = 5000;');
  const escapedTarget = databaseTarget.replaceAll("'", "''");
  sourceDatabase.exec(`VACUUM INTO '${escapedTarget}'`);
  sourceDatabase.close();
  sourceDatabase = undefined;

  backupDatabase = new DatabaseSync(databaseTarget, { readOnly: true });
  const integrity = backupDatabase.prepare('PRAGMA integrity_check').get()?.integrity_check;
  if (integrity !== 'ok') throw new Error(`SQLite整合性検査に失敗しました: ${String(integrity)}`);
  const tables = backupDatabase
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
  const rowCounts = Object.fromEntries(
    tables.map((table) => {
      const quoted = table.replaceAll('"', '""');
      const count = backupDatabase
        .prepare(`SELECT COUNT(*) AS count FROM "${quoted}"`)
        .get()?.count;
      return [table, Number(count ?? 0)];
    }),
  );
  backupDatabase.close();
  backupDatabase = undefined;

  const databaseData = readFileSync(databaseTarget);
  const hash = createHash('sha256').update(databaseData).digest('hex');
  let authSecret = 'not-found';
  let authSecretSha256;
  const localSecret = resolve(dirname(source), 'auth-secret');
  if (process.env.BETTER_AUTH_SECRET) authSecret = 'external-environment-not-included';
  else if (existsSync(localSecret)) {
    const secretTarget = resolve(target, 'auth-secret');
    copyFileSync(localSecret, secretTarget);
    try {
      chmodSync(secretTarget, 0o600);
    } catch {
      // WindowsではPOSIX権限を設定できないため、共有対象からの除外で保護する。
    }
    authSecret = 'included';
    authSecretSha256 = createHash('sha256').update(readFileSync(secretTarget)).digest('hex');
  }

  const manifest = {
    backupType: 'private-sqlite',
    createdAt: new Date().toISOString(),
    sourceFile: basename(source),
    databaseFile: 'kotoba.sqlite',
    databaseBytes: databaseData.length,
    databaseSha256: hash,
    integrityCheck: 'ok',
    rowCounts,
    authSecret,
    ...(authSecretSha256 ? { authSecretSha256 } : {}),
    containsSensitiveData: true,
  };
  writeFileSync(resolve(target, 'backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx',
  });
  writeFileSync(
    resolve(target, 'RESTORE.txt'),
    [
      'このフォルダーは非共有バックアップです。アカウント・メールアドレス・学習データを含みます。',
      '',
      '復元前にアプリを停止し、現在の.dataも別名で保管してください。',
      '1. npm run backup:verify -- "このバックアップフォルダー"',
      '2. kotoba.sqlite を .data/kotoba.sqlite へコピーします。',
      authSecret === 'included'
        ? '3. auth-secret を .data/auth-secret へコピーします。'
        : '3. バックアップ作成時と同じBETTER_AUTH_SECRETを環境変数に設定します。',
      '4. アプリを起動し、ログイン・階層・学習状態を確認します。',
      '',
      'このフォルダーを共有用ZIP、Git、公開ストレージへ入れないでください。',
      '',
    ].join('\n'),
    { flag: 'wx' },
  );
  console.log(`非共有バックアップを作成しました: ${target}`);
  console.log(`SQLite整合性: ok / SHA-256: ${hash}`);
  console.log(`認証シークレット: ${authSecret}`);
} catch (error) {
  try {
    sourceDatabase?.close();
    backupDatabase?.close();
  } catch {
    // 元のエラーを優先する。
  }
  rmSync(target, { recursive: true, force: true });
  throw error;
}

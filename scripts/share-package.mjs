import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

const ALLOWED_ROOT_FILES = new Set([
  '.dockerignore',
  '.env.example',
  '.gitignore',
  '.prettierrc.json',
  'Dockerfile',
  'README.md',
  'eslint.config.js',
  'index.html',
  'package-lock.json',
  'package.json',
  'railway.json',
  'render.yaml',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
]);
const ALLOWED_ROOT_DIRECTORIES = ['docs', 'public', 'scripts', 'server', 'src'];
const FORBIDDEN_SEGMENTS = new Set([
  '.artifacts',
  '.backups',
  '.data',
  '.git',
  '.npm-cache',
  'build',
  'dist',
  'node_modules',
]);
const FORBIDDEN_FILE =
  /(?:^|\/)(?:auth-secret|credentials(?:\.[^/]*)?|service-account[^/]*\.json|\.env(?:\..*)?|.*\.(?:(?:sqlite|sqlite3|db)(?:-[^/]*)?|pem|key|p12|pfx|zip))$/i;

function normalizedPath(path) {
  return path.split(sep).join('/').replaceAll('\\', '/').replace(/^\.\//, '');
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function isForbiddenArchivePath(path) {
  const normalized = normalizedPath(path);
  const segments = normalized.split('/');
  return (
    !normalized ||
    normalized.startsWith('/') ||
    segments.includes('..') ||
    segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment)) ||
    (normalized !== '.env.example' && FORBIDDEN_FILE.test(normalized))
  );
}

function looksLikePlaceholder(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '');
  return (
    !normalized ||
    /^(?:your[-_]|example|sample|changeme|replace|todo|xxx|<|\$\{|実際|ここに)/i.test(normalized)
  );
}

export function findSensitiveContent(path, data) {
  if (data.includes(0)) return [];
  const text = data.toString('utf8');
  const findings = [];
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push('秘密鍵');
  if (/\bAIza[0-9A-Za-z_-]{30,}\b/.test(text)) findings.push('Google APIキーらしい文字列');
  if (/\bGOCSPX-[0-9A-Za-z_-]{20,}\b/.test(text))
    findings.push('Google OAuthシークレットらしい文字列');
  if (/\bre_[0-9A-Za-z_]{20,}\b/.test(text)) findings.push('Resend APIキーらしい文字列');
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/[^\s'"`]+/gi)) {
    try {
      const url = new URL(match[0]);
      const placeholderHost =
        ['localhost', '127.0.0.1'].includes(url.hostname) || url.hostname.endsWith('.example.com');
      const placeholderCredentials =
        ['user', 'postgres'].includes(url.username) &&
        ['secret', 'postgres'].includes(url.password);
      if (!placeholderHost && !placeholderCredentials)
        findings.push('パスワードを含むPostgreSQL URL');
    } catch {
      findings.push('解析できないPostgreSQL URL');
    }
  }

  const assignment =
    /^[ \t]*(?:export[ \t]+|\$env:)?(DATABASE_URL|BETTER_AUTH_SECRET|GOOGLE_CLIENT_SECRET|LINE_CLIENT_SECRET|SMTP_PASSWORD|RESEND_API_KEY|GEMINI_API_KEY)[ \t]*=[ \t]*(.*?)[ \t]*$/gim;
  for (const match of text.matchAll(assignment)) {
    if (!looksLikePlaceholder(match[2])) findings.push(`${match[1]}の値`);
  }
  return [...new Set(findings)].map((finding) => `${path}: ${finding}`);
}

function collectDirectory(root, directory, files) {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const fullPath = join(absolute, entry.name);
    const archivePath = normalizedPath(relative(root, fullPath));
    if (isForbiddenArchivePath(archivePath)) continue;
    if (lstatSync(fullPath).isSymbolicLink())
      throw new Error(`共有対象にシンボリックリンクを含められません: ${archivePath}`);
    if (entry.isDirectory()) collectDirectory(root, archivePath, files);
    else if (entry.isFile()) files.push({ path: archivePath, absolute: fullPath });
  }
}

export function collectShareFiles(root = process.cwd()) {
  const files = [];
  for (const name of [...ALLOWED_ROOT_FILES].sort()) {
    const absolute = resolve(root, name);
    if (existsSync(absolute) && statSync(absolute).isFile()) files.push({ path: name, absolute });
  }
  for (const directory of ALLOWED_ROOT_DIRECTORIES) collectDirectory(root, directory, files);
  files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return files;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

export function createZip(entries, outputPath, modifiedAt = new Date()) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime(modifiedAt);
  for (const entry of entries) {
    const name = Buffer.from(normalizedPath(entry.path), 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  writeFileSync(outputPath, Buffer.concat([...localParts, centralDirectory, end]), { flag: 'wx' });
}

function findEndRecord(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset--)
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  throw new Error('ZIPの終端情報が見つかりません。');
}

export function readZipEntries(zipPath) {
  const archive = readFileSync(zipPath);
  const endOffset = findEndRecord(archive);
  const count = archive.readUInt16LE(endOffset + 10);
  let centralOffset = archive.readUInt32LE(endOffset + 16);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50)
      throw new Error('ZIPの索引が壊れています。');
    const method = archive.readUInt16LE(centralOffset + 10);
    const expectedCrc = archive.readUInt32LE(centralOffset + 16);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const expectedSize = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString();
    if (archive.readUInt32LE(localOffset) !== 0x04034b50)
      throw new Error(`${name}: ZIPのファイル情報が壊れています。`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : null;
    if (!data || data.length !== expectedSize || crc32(data) >>> 0 !== expectedCrc)
      throw new Error(`${name}: ZIP内データの検証に失敗しました。`);
    if (entries.has(name)) throw new Error(`${name}: ZIP内のパスが重複しています。`);
    entries.set(name, data);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function verifyShareEntries(entries) {
  const errors = [];
  for (const [path, data] of entries) {
    if (path !== 'SHARE-MANIFEST.json' && isForbiddenArchivePath(path))
      errors.push(`${path}: 共有禁止ファイル`);
    if (path !== 'SHARE-MANIFEST.json') errors.push(...findSensitiveContent(path, data));
  }
  const manifestData = entries.get('SHARE-MANIFEST.json');
  if (!manifestData) errors.push('SHARE-MANIFEST.json がありません。');
  else {
    try {
      const manifest = JSON.parse(manifestData.toString('utf8'));
      if (manifest.archiveType !== 'source-only') errors.push('共有用マニフェストではありません。');
      const listed = new Map(manifest.files?.map((file) => [file.path, file.sha256]) ?? []);
      for (const [path, data] of entries) {
        if (path === 'SHARE-MANIFEST.json') continue;
        if (listed.get(path) !== sha256(data)) errors.push(`${path}: SHA-256が一致しません。`);
        listed.delete(path);
      }
      for (const path of listed.keys()) errors.push(`${path}: ZIP内にありません。`);
    } catch {
      errors.push('SHARE-MANIFEST.json を解析できません。');
    }
  }
  if (errors.length) throw new Error(`共有ZIPの検証に失敗しました。\n${errors.join('\n')}`);
  return { fileCount: entries.size - 1 };
}

export function defaultShareZipName(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `kotoba-flashcards-source-${stamp}.zip`;
}

export function archiveLabel(path) {
  return basename(path, extname(path));
}

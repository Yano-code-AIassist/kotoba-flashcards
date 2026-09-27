import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createZip,
  findSensitiveContent,
  isForbiddenArchivePath,
  readZipEntries,
  sha256,
  verifyShareEntries,
} from './share-package.mjs';

const temporary = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('共有ZIP', () => {
  it('秘密・DB・バックアップのパスを共有対象外にする', () => {
    expect(isForbiddenArchivePath('.env')).toBe(true);
    expect(isForbiddenArchivePath('.data/kotoba.sqlite-wal')).toBe(true);
    expect(isForbiddenArchivePath('temporary.sqlite-journal')).toBe(true);
    expect(isForbiddenArchivePath('.backups/kotoba.sqlite')).toBe(true);
    expect(isForbiddenArchivePath('keys/private.pem')).toBe(true);
    expect(isForbiddenArchivePath('.env.example')).toBe(false);
    expect(isForbiddenArchivePath('src/main.tsx')).toBe(false);
  });

  it('共有ファイル内の代表的な秘密情報を検出する', () => {
    expect(
      findSensitiveContent(
        'bad.env',
        Buffer.from(`GEMINI_API_KEY=${['AIza', '123456789012345678901234567890'].join('')}`),
      ),
    ).not.toEqual([]);
    expect(findSensitiveContent('.env.example', Buffer.from('GEMINI_API_KEY=\n'))).toEqual([]);
  });

  it('作成したZIPを展開検証し、マニフェストのハッシュを照合する', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kotoba-share-test-'));
    temporary.push(directory);
    const output = join(directory, 'source.zip');
    const source = Buffer.from('export const value = 1;\n');
    const manifest = Buffer.from(
      JSON.stringify({
        archiveType: 'source-only',
        files: [{ path: 'src/example.ts', sha256: sha256(source) }],
      }),
    );
    createZip(
      [
        { path: 'src/example.ts', data: source },
        { path: 'SHARE-MANIFEST.json', data: manifest },
      ],
      output,
    );
    const entries = readZipEntries(output);
    expect(entries.get('src/example.ts')?.toString()).toBe(source.toString());
    expect(verifyShareEntries(entries)).toEqual({ fileCount: 1 });
    expect(readFileSync(output).length).toBeGreaterThan(0);
  });
});

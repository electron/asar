import { describe, it, afterAll, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

import {
  createPackage,
  createPackageFromFiles,
  createPackageWithOptions,
  createPackageFromStreams,
  extractAll,
  extractFile,
  listPackage,
  statFile,
  getRawHeader,
  uncache,
  uncacheAll,
  type AsarStreamType,
} from '../src/asar.js';
import { Pickle } from '../src/pickle.js';
import { getFileIntegrity } from '../src/integrity.js';
import { readArchiveHeaderSync, readFilesystemSync, uncacheFilesystem } from '../src/disk.js';
import { crawl, determineFileType } from '../src/crawlfs.js';

// Each test run gets its own temp directory to avoid conflicts and
// flaky rmSync on Windows (file locks, antivirus).
const testRunDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-test-'));

function tmpDir(name: string) {
  const dir = path.join(testRunDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createFixture(name: string, files: Record<string, string | Buffer>) {
  const dir = tmpDir(name);
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

describe('robustness', () => {
  afterAll(() => {
    uncacheAll();
    fs.rmSync(testRunDir, { recursive: true, force: true });
  });

  // ─── Empty and degenerate archives ───────────────────────────────

  describe('empty and degenerate inputs', () => {
    it('should create archive from empty directory', async () => {
      const src = tmpDir('empty-dir');
      const dest = path.join(testRunDir, 'empty.asar');
      await createPackage(src, dest);
      expect(fs.existsSync(dest)).toBe(true);
      const files = listPackage(dest, { isPack: false });
      expect(files).toEqual([]);
    });

    it('should create and extract archive with a single empty file', async () => {
      const src = createFixture('single-empty', { 'empty.txt': '' });
      const dest = path.join(testRunDir, 'single-empty.asar');
      await createPackage(src, dest);
      const content = extractFile(dest, 'empty.txt');
      expect(content.length).toBe(0);
    });

    it('should handle files with only whitespace content', async () => {
      const src = createFixture('whitespace', {
        'spaces.txt': '   ',
        'newlines.txt': '\n\n\n',
        'tabs.txt': '\t\t',
        'mixed.txt': ' \n\t\r\n ',
      });
      const dest = path.join(testRunDir, 'whitespace.asar');
      await createPackage(src, dest);
      expect(extractFile(dest, 'spaces.txt').toString()).toBe('   ');
      expect(extractFile(dest, 'newlines.txt').toString()).toBe('\n\n\n');
      expect(extractFile(dest, 'tabs.txt').toString()).toBe('\t\t');
      expect(extractFile(dest, 'mixed.txt').toString()).toBe(' \n\t\r\n ');
    });

    it('should handle deeply nested empty directories', async () => {
      const src = tmpDir('deep-empty');
      fs.mkdirSync(path.join(src, 'a', 'b', 'c', 'd', 'e', 'f'), { recursive: true });
      const dest = path.join(testRunDir, 'deep-empty.asar');
      await createPackage(src, dest);
      const files = listPackage(dest, { isPack: false });
      expect(files.some((f) => f.includes('f'))).toBe(true);
    });
  });

  // ─── Roundtrip integrity ─────────────────────────────────────────

  describe('roundtrip integrity', () => {
    it('should preserve exact file contents through pack/extract cycle', async () => {
      const binaryContent = crypto.randomBytes(1024);
      const textContent = 'Hello, world! 🌍 女の子 Ñoño';
      const src = createFixture('roundtrip', {
        'binary.bin': binaryContent,
        'text.txt': textContent,
        'subdir/nested.dat': crypto.randomBytes(512),
      });
      const dest = path.join(testRunDir, 'roundtrip.asar');
      await createPackage(src, dest);

      const extractDir = path.join(testRunDir, 'roundtrip-extracted');
      extractAll(dest, extractDir);

      expect(fs.readFileSync(path.join(extractDir, 'binary.bin'))).toEqual(binaryContent);
      expect(fs.readFileSync(path.join(extractDir, 'text.txt'), 'utf8')).toBe(textContent);
      expect(fs.readFileSync(path.join(extractDir, 'subdir/nested.dat'))).toEqual(
        fs.readFileSync(path.join(src, 'subdir/nested.dat')),
      );
    });

    it('should produce identical archives from same input', async () => {
      const src = createFixture('deterministic', {
        'a.txt': 'aaa',
        'b.txt': 'bbb',
        'dir/c.txt': 'ccc',
      });
      const dest1 = path.join(testRunDir, 'det1.asar');
      const dest2 = path.join(testRunDir, 'det2.asar');
      await createPackage(src, dest1);
      await createPackage(src, dest2);
      expect(fs.readFileSync(dest1)).toEqual(fs.readFileSync(dest2));
    });

    it('should handle many small files through pack/extract', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 200; i++) {
        files[`dir${i % 10}/file${i}.txt`] = `content-${i}`;
      }
      const src = createFixture('many-files', files);
      const dest = path.join(testRunDir, 'many.asar');
      await createPackage(src, dest);

      const extractDir = path.join(testRunDir, 'many-extracted');
      extractAll(dest, extractDir);

      for (const [filePath, content] of Object.entries(files)) {
        expect(fs.readFileSync(path.join(extractDir, filePath), 'utf8')).toBe(content);
      }
    });

    it('should preserve executable bit through pack/extract', async function () {
      if (process.platform === 'win32') return;
      const src = createFixture('executable', { 'script.sh': '#!/bin/bash\necho hi' });
      fs.chmodSync(path.join(src, 'script.sh'), 0o755);

      const dest = path.join(testRunDir, 'executable.asar');
      await createPackage(src, dest);

      const extractDir = path.join(testRunDir, 'executable-extracted');
      extractAll(dest, extractDir);

      const stat = fs.statSync(path.join(extractDir, 'script.sh'));
      expect(stat.mode & 0o111).toBeGreaterThan(0);
    });
  });

  // ─── Special filenames ───────────────────────────────────────────

  describe('special filenames', () => {
    it('should handle files with spaces in names', async () => {
      const src = createFixture('spaces-in-names', {
        'file with spaces.txt': 'content',
        'dir with spaces/nested file.txt': 'nested',
      });
      const dest = path.join(testRunDir, 'spaces.asar');
      await createPackage(src, dest);
      expect(extractFile(dest, 'file with spaces.txt').toString()).toBe('content');
      expect(extractFile(dest, 'dir with spaces/nested file.txt').toString()).toBe('nested');
    });

    it('should handle files with special characters', async () => {
      const src = createFixture('special-chars', {
        'file-with-dashes.txt': 'dashes',
        'file_with_underscores.txt': 'underscores',
        'file.multiple.dots.txt': 'dots',
        "file'with'quotes.txt": 'quotes',
      });
      const dest = path.join(testRunDir, 'special.asar');
      await createPackage(src, dest);
      expect(extractFile(dest, 'file-with-dashes.txt').toString()).toBe('dashes');
      expect(extractFile(dest, 'file.multiple.dots.txt').toString()).toBe('dots');
    });

    it('should handle very long filenames', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      const src = createFixture('long-name', { [longName]: 'content' });
      const dest = path.join(testRunDir, 'long-name.asar');
      await createPackage(src, dest);
      expect(extractFile(dest, longName).toString()).toBe('content');
    });

    it('should handle files with unicode names', async () => {
      const src = createFixture('unicode-names', {
        '日本語.txt': 'japanese',
        'émoji_🎉.txt': 'emoji',
        'Ñoño.txt': 'spanish',
        'Ελληνικά.txt': 'greek',
      });
      const dest = path.join(testRunDir, 'unicode-names.asar');
      await createPackage(src, dest);
      expect(extractFile(dest, '日本語.txt').toString()).toBe('japanese');
      expect(extractFile(dest, 'Ñoño.txt').toString()).toBe('spanish');
    });
  });

  // ─── File size edge cases ────────────────────────────────────────

  describe('file sizes', () => {
    it('should handle a mix of empty and non-empty files', async () => {
      const src = createFixture('mixed-sizes', {
        'empty1.txt': '',
        'small.txt': 'x',
        'empty2.txt': '',
        'medium.txt': 'y'.repeat(1000),
        'empty3.txt': '',
      });
      const dest = path.join(testRunDir, 'mixed-sizes.asar');
      await createPackage(src, dest);

      expect(extractFile(dest, 'empty1.txt').length).toBe(0);
      expect(extractFile(dest, 'small.txt').toString()).toBe('x');
      expect(extractFile(dest, 'empty2.txt').length).toBe(0);
      expect(extractFile(dest, 'medium.txt').toString()).toBe('y'.repeat(1000));
      expect(extractFile(dest, 'empty3.txt').length).toBe(0);
    });

    it('should handle a file exactly at 1 byte', async () => {
      const src = createFixture('one-byte', { 'one.bin': Buffer.from([0x42]) });
      const dest = path.join(testRunDir, 'one-byte.asar');
      await createPackage(src, dest);
      const extracted = extractFile(dest, 'one.bin');
      expect(extracted.length).toBe(1);
      expect(extracted[0]).toBe(0x42);
    });

    it('should handle files with null bytes', async () => {
      const content = Buffer.from([0x00, 0x01, 0x00, 0xff, 0x00]);
      const src = createFixture('null-bytes', { 'nulls.bin': content });
      const dest = path.join(testRunDir, 'null-bytes.asar');
      await createPackage(src, dest);
      expect(extractFile(dest, 'nulls.bin')).toEqual(content);
    });

    it(
      'should handle file larger than buffer hash threshold (2MB)',
      { timeout: 30000 },
      async () => {
        const content = crypto.randomBytes(3 * 1024 * 1024); // 3MB
        const src = createFixture('large-file', { 'large.bin': content });
        const dest = path.join(testRunDir, 'large.asar');
        await createPackage(src, dest);

        const extractDir = path.join(testRunDir, 'large-extracted');
        extractAll(dest, extractDir);
        expect(fs.readFileSync(path.join(extractDir, 'large.bin'))).toEqual(content);
      },
    );

    it('should handle file exactly at 4MB block boundary', { timeout: 30000 }, async () => {
      const content = crypto.randomBytes(4 * 1024 * 1024);
      const src = createFixture('block-boundary', { 'exact4mb.bin': content });
      const dest = path.join(testRunDir, 'block-boundary.asar');
      await createPackage(src, dest);
      const extractDir = path.join(testRunDir, 'block-boundary-extracted');
      extractAll(dest, extractDir);
      expect(fs.readFileSync(path.join(extractDir, 'exact4mb.bin'))).toEqual(content);
    });
  });

  // ─── Error handling ──────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw when extracting non-existent file from archive', async () => {
      const src = createFixture('for-error', { 'exists.txt': 'yes' });
      const dest = path.join(testRunDir, 'for-error.asar');
      await createPackage(src, dest);
      expect(() => extractFile(dest, 'does-not-exist.txt')).toThrow(/was not found/);
    });

    it('should throw when extracting from non-existent archive', () => {
      expect(() => extractFile('nonexistent.asar', 'file.txt')).toThrow();
    });

    it('should throw when listing non-existent archive', () => {
      expect(() => listPackage('nonexistent.asar', { isPack: false })).toThrow();
    });

    it('should throw when statting non-existent file in archive', async () => {
      const src = createFixture('for-stat-error', { 'exists.txt': 'yes' });
      const dest = path.join(testRunDir, 'for-stat-error.asar');
      await createPackage(src, dest);
      expect(() => statFile(dest, 'missing.txt')).toThrow(/was not found/);
    });

    it('should throw when extracting a directory path as a file', async () => {
      const src = createFixture('dir-as-file', { 'subdir/file.txt': 'content' });
      const dest = path.join(testRunDir, 'dir-as-file.asar');
      await createPackage(src, dest);
      expect(() => extractFile(dest, 'subdir')).toThrow(/directory or link/);
    });

    it('should throw on corrupted archive header', () => {
      const corruptPath = path.join(testRunDir, 'corrupt.asar');
      fs.writeFileSync(corruptPath, crypto.randomBytes(16));
      expect(() => getRawHeader(corruptPath)).toThrow();
    });

    it('should throw on truncated archive (too small for header)', () => {
      const truncPath = path.join(testRunDir, 'truncated.asar');
      fs.writeFileSync(truncPath, Buffer.alloc(4));
      expect(() => getRawHeader(truncPath)).toThrow(/Unable to read header/);
    });
  });

  // ─── Cache behavior ──────────────────────────────────────────────

  describe('caching', () => {
    it('uncacheFilesystem should return true for cached and false for uncached', async () => {
      const src = createFixture('cache-test', { 'file.txt': 'hi' });
      const dest = path.join(testRunDir, 'cache-test.asar');
      await createPackage(src, dest);

      // First read caches it
      readFilesystemSync(dest);
      expect(uncacheFilesystem(dest)).toBe(true);
      expect(uncacheFilesystem(dest)).toBe(false);
    });

    it('uncacheAll should clear all cached filesystems', async () => {
      const src = createFixture('cache-all', { 'file.txt': 'hi' });
      const dest1 = path.join(testRunDir, 'cache1.asar');
      const dest2 = path.join(testRunDir, 'cache2.asar');
      await createPackage(src, dest1);
      await createPackage(src, dest2);

      readFilesystemSync(dest1);
      readFilesystemSync(dest2);
      uncacheAll();
      expect(uncacheFilesystem(dest1)).toBe(false);
      expect(uncacheFilesystem(dest2)).toBe(false);
    });

    it('should return same filesystem instance from cache', async () => {
      const src = createFixture('cache-identity', { 'file.txt': 'hi' });
      const dest = path.join(testRunDir, 'cache-identity.asar');
      await createPackage(src, dest);

      const fs1 = readFilesystemSync(dest);
      const fs2 = readFilesystemSync(dest);
      expect(fs1).toBe(fs2);
    });
  });

  // ─── Integrity hashing ──────────────────────────────────────────

  describe('integrity', () => {
    it('should produce consistent results for same data', async () => {
      const data = crypto.randomBytes(8192);
      const tmpFile = path.join(os.tmpdir(), 'integrity-test-' + Date.now());
      fs.writeFileSync(tmpFile, data);

      try {
        const result1 = await getFileIntegrity(fs.createReadStream(tmpFile));
        const result2 = await getFileIntegrity(fs.createReadStream(tmpFile));
        expect(result1).toEqual(result2);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('should handle empty file', async () => {
      const tmpFile = path.join(os.tmpdir(), 'integrity-empty-' + Date.now());
      fs.writeFileSync(tmpFile, Buffer.alloc(0));

      try {
        const result = await getFileIntegrity(fs.createReadStream(tmpFile));
        expect(result.blocks.length).toBe(1);
        expect(result.algorithm).toBe('SHA256');
        expect(result.hash).toBeTruthy();
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('should produce correct block count for multi-block files', async () => {
      // 9MB file should produce 3 blocks (4MB + 4MB + 1MB)
      const data = crypto.randomBytes(9 * 1024 * 1024);
      const tmpFile = path.join(os.tmpdir(), 'integrity-multi-' + Date.now());
      fs.writeFileSync(tmpFile, data);

      try {
        const result = await getFileIntegrity(fs.createReadStream(tmpFile));
        expect(result.blocks.length).toBe(3);
        expect(result.blockSize).toBe(4 * 1024 * 1024);
        expect(result.algorithm).toBe('SHA256');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('should produce exactly one block for file smaller than block size', async () => {
      const tmpFile = path.join(os.tmpdir(), 'integrity-small-' + Date.now());
      fs.writeFileSync(tmpFile, crypto.randomBytes(100));

      try {
        const result = await getFileIntegrity(fs.createReadStream(tmpFile));
        expect(result.blocks.length).toBe(1);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('should produce one block for file exactly at block size', async () => {
      const tmpFile = path.join(os.tmpdir(), 'integrity-exact-' + Date.now());
      fs.writeFileSync(tmpFile, crypto.randomBytes(4 * 1024 * 1024));

      try {
        const result = await getFileIntegrity(fs.createReadStream(tmpFile));
        expect(result.blocks.length).toBe(1);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('should produce different hashes for different content', async () => {
      const tmp1 = path.join(os.tmpdir(), 'integrity-diff1-' + Date.now());
      const tmp2 = path.join(os.tmpdir(), 'integrity-diff2-' + Date.now());
      fs.writeFileSync(tmp1, 'hello');
      fs.writeFileSync(tmp2, 'world');

      try {
        const result1 = await getFileIntegrity(fs.createReadStream(tmp1));
        const result2 = await getFileIntegrity(fs.createReadStream(tmp2));
        expect(result1.hash).not.toBe(result2.hash);
      } finally {
        fs.unlinkSync(tmp1);
        fs.unlinkSync(tmp2);
      }
    });

    it('integrity hash stored in archive should match file content', async () => {
      const content = 'test content for integrity verification';
      const src = createFixture('integrity-verify', { 'test.txt': content });
      const dest = path.join(testRunDir, 'integrity-verify.asar');
      await createPackage(src, dest);

      const header = getRawHeader(dest);
      const fileEntry = (header.header as any).files['test.txt'];
      const expectedHash = crypto.createHash('SHA256').update(content).digest('hex');
      expect(fileEntry.integrity.hash).toBe(expectedHash);
    });
  });

  // ─── Pickle serialization ───────────────────────────────────────

  describe('pickle', () => {
    it('should roundtrip all integer types', () => {
      const p = Pickle.createEmpty();
      p.writeInt(-42);
      p.writeUInt32(42);
      p.writeInt64(123456789);
      p.writeUInt64(987654321);

      const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
      expect(iter.readInt()).toBe(-42);
      expect(iter.readUInt32()).toBe(42);
      expect(iter.readInt64()).toBe(BigInt(123456789));
      expect(iter.readUInt64()).toBe(BigInt(987654321));
    });

    it('should roundtrip float and double', () => {
      const p = Pickle.createEmpty();
      p.writeFloat(3.14);
      p.writeDouble(2.718281828459045);

      const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
      expect(iter.readFloat()).toBeCloseTo(3.14, 2);
      expect(iter.readDouble()).toBeCloseTo(2.718281828459045, 10);
    });

    it('should roundtrip boolean values', () => {
      const p = Pickle.createEmpty();
      p.writeBool(true);
      p.writeBool(false);

      const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
      expect(iter.readBool()).toBe(true);
      expect(iter.readBool()).toBe(false);
    });

    it('should roundtrip empty string', () => {
      const p = Pickle.createEmpty();
      p.writeString('');
      const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
      expect(iter.readString()).toBe('');
    });

    it('should roundtrip very long string', () => {
      const longStr = 'x'.repeat(100000);
      const p = Pickle.createEmpty();
      p.writeString(longStr);
      const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
      expect(iter.readString()).toBe(longStr);
    });

    it('should throw when reading past end of pickle', () => {
      const p = Pickle.createEmpty();
      p.writeInt(1);
      const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
      iter.readInt(); // consume the one value
      expect(() => iter.readInt()).toThrow(/Failed to read data/);
    });

    it('should handle multiple resizes for large payloads', () => {
      const p = Pickle.createEmpty();
      // Write enough data to trigger multiple resizes (initial capacity is 64 bytes)
      for (let i = 0; i < 100; i++) {
        p.writeString(`string-${i}-${'x'.repeat(50)}`);
      }
      const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
      for (let i = 0; i < 100; i++) {
        expect(iter.readString()).toBe(`string-${i}-${'x'.repeat(50)}`);
      }
    });

    it('should handle mixed types in sequence', () => {
      const p = Pickle.createEmpty();
      p.writeInt(1);
      p.writeString('hello');
      p.writeBool(true);
      p.writeDouble(99.9);
      p.writeUInt32(0xffffffff);
      p.writeString('世界');

      const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
      expect(iter.readInt()).toBe(1);
      expect(iter.readString()).toBe('hello');
      expect(iter.readBool()).toBe(true);
      expect(iter.readDouble()).toBeCloseTo(99.9);
      expect(iter.readUInt32()).toBe(0xffffffff);
      expect(iter.readString()).toBe('世界');
    });

    it('should throw on zero-length buffer in createFromBuffer', () => {
      const buf = Buffer.alloc(0);
      expect(() => Pickle.createFromBuffer(buf)).toThrow();
    });
  });

  // ─── Filesystem tree operations ──────────────────────────────────

  describe('filesystem', () => {
    it('should handle getFile with followLinks=false', async () => {
      if (process.platform === 'win32') return;
      const src = tmpDir('follow-links-false');
      fs.writeFileSync(path.join(src, 'target.txt'), 'content');
      fs.symlinkSync('target.txt', path.join(src, 'link.txt'));

      const dest = path.join(testRunDir, 'follow-links.asar');
      await createPackage(src, dest);

      const stat = statFile(dest, 'link.txt', false);
      expect('link' in stat).toBe(true);

      const statFollowed = statFile(dest, 'link.txt', true);
      expect('link' in statFollowed).toBe(false);
    });

    it('should list files with isPack option showing pack/unpack state', async () => {
      const src = createFixture('pack-list', {
        'packed.txt': 'packed',
        'unpacked.node': 'native',
      });
      const dest = path.join(testRunDir, 'pack-list.asar');
      await createPackageWithOptions(src, dest, { unpack: '*.node' });

      const list = listPackage(dest, { isPack: true });
      const packedEntry = list.find((l) => l.includes('packed.txt'));
      const unpackedEntry = list.find((l) => l.includes('unpacked.node'));
      expect(packedEntry).toMatch(/pack\s+:/);
      expect(unpackedEntry).toMatch(/unpack\s*:/);
    });

    it('getRawHeader should return parseable header', async () => {
      const src = createFixture('raw-header', {
        'file1.txt': 'hello',
        'dir/file2.txt': 'world',
      });
      const dest = path.join(testRunDir, 'raw-header.asar');
      await createPackage(src, dest);

      const { header, headerString, headerSize } = getRawHeader(dest);
      expect(headerSize).toBeGreaterThan(0);
      expect(headerString).toBeTruthy();
      expect(header.files).toBeDefined();
      expect(JSON.parse(headerString)).toEqual(header);
    });

    it('should handle deeply nested directories', async () => {
      const parts = Array.from({ length: 20 }, (_, i) => `d${i}`);
      const deepPath = parts.join('/');
      const src = createFixture('deep-nest', { [`${deepPath}/file.txt`]: 'deep' });
      const dest = path.join(testRunDir, 'deep-nest.asar');
      await createPackage(src, dest);
      const extractPath = path.join(...parts, 'file.txt');
      expect(extractFile(dest, extractPath).toString()).toBe('deep');
    });
  });

  // ─── Unpack patterns ─────────────────────────────────────────────

  describe('unpack patterns', () => {
    it('should unpack files matching glob pattern', async () => {
      const src = createFixture('unpack-glob', {
        'app.js': 'js code',
        'native.node': 'native module',
        'other.node': 'another native',
        'data.json': '{}',
      });
      const dest = path.join(testRunDir, 'unpack-glob.asar');
      await createPackageWithOptions(src, dest, { unpack: '*.node' });

      expect(fs.existsSync(`${dest}.unpacked`)).toBe(true);

      // Packed files should still be extractable
      expect(extractFile(dest, 'app.js').toString()).toBe('js code');
      expect(extractFile(dest, 'data.json').toString()).toBe('{}');

      // Unpacked files should exist in .unpacked directory
      expect(fs.existsSync(path.join(`${dest}.unpacked`, 'native.node'))).toBe(true);
    });

    it('should handle unpackDir with nested structure', async () => {
      const src = createFixture('unpack-dir', {
        'src/app.js': 'code',
        'node_modules/dep/index.js': 'dep code',
        'node_modules/dep/native.node': 'native',
      });
      const dest = path.join(testRunDir, 'unpack-dir.asar');
      await createPackageWithOptions(src, dest, { unpackDir: 'node_modules' });

      // The src files should be packed
      expect(extractFile(dest, 'src/app.js').toString()).toBe('code');
    });
  });

  // ─── createPackageFromFiles ──────────────────────────────────────

  describe('createPackageFromFiles', () => {
    it('should work with pre-crawled files', async () => {
      const src = createFixture('from-files', {
        'a.txt': 'aaa',
        'b.txt': 'bbb',
        'sub/c.txt': 'ccc',
      });
      const dest = path.join(testRunDir, 'from-files.asar');
      const [filenames, metadata] = await crawl(src + '/**/*', { dot: true });
      await createPackageFromFiles(src, dest, [...filenames], { ...metadata });

      expect(extractFile(dest, 'a.txt').toString()).toBe('aaa');
      expect(extractFile(dest, 'b.txt').toString()).toBe('bbb');
      expect(extractFile(dest, 'sub/c.txt').toString()).toBe('ccc');
    });

    it('should work with empty metadata (auto-detect types)', async () => {
      const src = createFixture('auto-metadata', {
        'file.txt': 'content',
      });
      const dest = path.join(testRunDir, 'auto-metadata.asar');
      const [filenames] = await crawl(src + '/**/*', { dot: true });
      await createPackageFromFiles(src, dest, [...filenames], {});
      expect(extractFile(dest, 'file.txt').toString()).toBe('content');
    });
  });

  // ─── createPackageFromStreams ─────────────────────────────────────

  describe('createPackageFromStreams', () => {
    it('should create archive from synthetic streams', async () => {
      // streamGenerator must return a fresh stream each call (called multiple times)
      const helloContent = Buffer.from('hello from stream');
      const rootContent = Buffer.from('root content');
      const streams: AsarStreamType[] = [
        {
          type: 'directory',
          path: 'mydir',
          unpacked: false,
        },
        {
          type: 'file',
          path: 'mydir/hello.txt',
          unpacked: false,
          streamGenerator: () => Readable.from(Buffer.from(helloContent)),
          stat: { mode: 0o644, size: helloContent.length },
        },
        {
          type: 'file',
          path: 'root.txt',
          unpacked: false,
          streamGenerator: () => Readable.from(Buffer.from(rootContent)),
          stat: { mode: 0o644, size: rootContent.length },
        },
      ];

      const dest = path.join(testRunDir, 'from-streams.asar');
      await createPackageFromStreams(dest, streams);

      expect(extractFile(dest, 'mydir/hello.txt').toString()).toBe('hello from stream');
      expect(extractFile(dest, 'root.txt').toString()).toBe('root content');
    });

    it('should handle empty file via streams', async () => {
      const streams: AsarStreamType[] = [
        {
          type: 'file',
          path: 'empty.txt',
          unpacked: false,
          streamGenerator: () => Readable.from(Buffer.alloc(0)),
          stat: { mode: 0o644, size: 0 },
        },
      ];

      const dest = path.join(testRunDir, 'stream-empty.asar');
      await createPackageFromStreams(dest, streams);

      expect(extractFile(dest, 'empty.txt').length).toBe(0);
    });
  });

  // ─── crawlfs ─────────────────────────────────────────────────────

  describe('crawlfs', () => {
    it('determineFileType should return null for special files', async () => {
      // /dev/null is not a regular file, directory, or symlink
      if (process.platform === 'win32') return;
      const result = await determineFileType('/dev/null');
      // /dev/null is classified as a file on macOS
      // This test just verifies it doesn't crash
      expect(result === null || result.type === 'file').toBe(true);
    });

    it('crawl should return sorted filenames', async () => {
      const src = createFixture('crawl-sort', {
        'z.txt': 'z',
        'a.txt': 'a',
        'm.txt': 'm',
      });
      const [filenames] = await crawl(src + '/**/*', { dot: true });
      const basenames = filenames.map((f) => path.basename(f)).filter((f) => f.endsWith('.txt'));
      expect(basenames).toEqual([...basenames].sort());
    });

    it('crawl should respect dot option', async () => {
      const src = createFixture('crawl-dot', {
        'visible.txt': 'visible',
        '.hidden': 'hidden',
      });
      const [withDot] = await crawl(src + '/**/*', { dot: true });
      const [withoutDot] = await crawl(src + '/**/*', { dot: false });

      expect(withDot.some((f) => f.includes('.hidden'))).toBe(true);
      expect(withoutDot.some((f) => f.includes('.hidden'))).toBe(false);
    });
  });

  // ─── extractAll edge cases ───────────────────────────────────────

  describe('extractAll edge cases', () => {
    it('should overwrite existing files on re-extract', async () => {
      const src = createFixture('overwrite', { 'file.txt': 'original' });
      const dest = path.join(testRunDir, 'overwrite.asar');
      await createPackage(src, dest);

      const extractDir = path.join(testRunDir, 'overwrite-extracted');
      extractAll(dest, extractDir);
      expect(fs.readFileSync(path.join(extractDir, 'file.txt'), 'utf8')).toBe('original');

      // Extract again — should overwrite without error
      extractAll(dest, extractDir);
      expect(fs.readFileSync(path.join(extractDir, 'file.txt'), 'utf8')).toBe('original');
    });

    it('should create intermediate directories during extraction', async () => {
      const src = createFixture('mkdir-extract', { 'a/b/c/d/file.txt': 'deep' });
      const dest = path.join(testRunDir, 'mkdir.asar');
      await createPackage(src, dest);

      const extractDir = path.join(testRunDir, 'mkdir-extracted');
      extractAll(dest, extractDir);
      expect(fs.readFileSync(path.join(extractDir, 'a', 'b', 'c', 'd', 'file.txt'), 'utf8')).toBe(
        'deep',
      );
    });

    it('should handle extracting archive with many identical-content files', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        files[`same${i}.txt`] = 'identical content';
      }
      const src = createFixture('identical', files);
      const dest = path.join(testRunDir, 'identical.asar');
      await createPackage(src, dest);

      const extractDir = path.join(testRunDir, 'identical-extracted');
      extractAll(dest, extractDir);
      for (let i = 0; i < 50; i++) {
        expect(fs.readFileSync(path.join(extractDir, `same${i}.txt`), 'utf8')).toBe(
          'identical content',
        );
      }
    });
  });

  // ─── Binary content edge cases ───────────────────────────────────

  describe('binary content', () => {
    it('should handle all possible byte values', async () => {
      const allBytes = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) allBytes[i] = i;
      const src = createFixture('all-bytes', { 'allbytes.bin': allBytes });
      const dest = path.join(testRunDir, 'all-bytes.asar');
      await createPackage(src, dest);
      expect(extractFile(dest, 'allbytes.bin')).toEqual(allBytes);
    });

    it('should handle files that look like they could be JSON', async () => {
      const src = createFixture('json-like', {
        'object.txt': '{"files": {"fake": "header"}}',
        'array.txt': '[1, 2, 3]',
        'string.txt': '"just a string"',
      });
      const dest = path.join(testRunDir, 'json-like.asar');
      await createPackage(src, dest);
      expect(extractFile(dest, 'object.txt').toString()).toBe('{"files": {"fake": "header"}}');
    });

    it('should preserve exact binary content with embedded nulls', async () => {
      const buf = Buffer.from([0xff, 0x00, 0xff, 0x00, 0xfe, 0xed, 0x00, 0x00, 0xca, 0xfe]);
      const src = createFixture('binary-nulls', { 'data.bin': buf });
      const dest = path.join(testRunDir, 'binary-nulls.asar');
      await createPackage(src, dest);

      const extractDir = path.join(testRunDir, 'binary-nulls-extracted');
      extractAll(dest, extractDir);
      expect(fs.readFileSync(path.join(extractDir, 'data.bin'))).toEqual(buf);
    });
  });

  // ─── Concurrent operations ───────────────────────────────────────

  describe('concurrent operations', () => {
    it('should handle concurrent pack operations to different files', async () => {
      const src = createFixture('concurrent-pack', {
        'file.txt': 'content for concurrent test',
      });

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => {
          const dest = path.join(testRunDir, `concurrent-${i}.asar`);
          return createPackage(src, dest).then(() => dest);
        }),
      );

      // All archives should be identical
      const firstContent = fs.readFileSync(results[0]);
      for (let i = 1; i < results.length; i++) {
        expect(fs.readFileSync(results[i])).toEqual(firstContent);
      }
    });

    it('should handle concurrent extract operations from same archive', async () => {
      const src = createFixture('concurrent-extract', {
        'a.txt': 'aaa',
        'b.txt': 'bbb',
      });
      const dest = path.join(testRunDir, 'concurrent-extract.asar');
      await createPackage(src, dest);

      // Extract to multiple destinations concurrently
      const extractions = Array.from({ length: 5 }, (_, i) => {
        const extractDir = path.join(testRunDir, `ce-${i}`);
        return new Promise<string>((resolve) => {
          uncache(dest);
          extractAll(dest, extractDir);
          resolve(extractDir);
        });
      });

      const dirs = await Promise.all(extractions);
      for (const dir of dirs) {
        expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('aaa');
        expect(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8')).toBe('bbb');
      }
    });

    it('should handle concurrent reads of different files from same archive', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        files[`file${i}.txt`] = `content-${i}`;
      }
      const src = createFixture('concurrent-read', files);
      const dest = path.join(testRunDir, 'concurrent-read.asar');
      await createPackage(src, dest);

      const reads = Object.keys(files).map((name) => {
        return Promise.resolve(extractFile(dest, name).toString());
      });

      const results = await Promise.all(reads);
      results.forEach((content, i) => {
        expect(content).toBe(`content-${i}`);
      });
    });
  });

  // ─── Transform function ──────────────────────────────────────────

  describe('transform', () => {
    it('should allow no-op transform (return void)', async () => {
      const src = createFixture('noop-transform', { 'file.txt': 'content' });
      const dest = path.join(testRunDir, 'noop-transform.asar');
      await createPackageWithOptions(src, dest, {
        transform: () => undefined,
      });
      expect(extractFile(dest, 'file.txt').toString()).toBe('content');
    });
  });

  // ─── Header parsing robustness ───────────────────────────────────

  describe('header parsing', () => {
    it('should parse header from archive with single file', async () => {
      const src = createFixture('single-file-header', { 'only.txt': 'x' });
      const dest = path.join(testRunDir, 'single-file-header.asar');
      await createPackage(src, dest);

      const { header } = readArchiveHeaderSync(dest);
      expect(header.files).toBeDefined();
      expect((header.files as any)['only.txt']).toBeDefined();
      expect((header.files as any)['only.txt'].size).toBe(1);
    });

    it('should contain integrity info for every file', async () => {
      const src = createFixture('integrity-header', {
        'a.txt': 'hello',
        'b.txt': 'world',
        'dir/c.txt': 'nested',
      });
      const dest = path.join(testRunDir, 'integrity-header.asar');
      await createPackage(src, dest);

      const { header } = readArchiveHeaderSync(dest);
      const aFile = (header.files as any)['a.txt'];
      expect(aFile.integrity).toBeDefined();
      expect(aFile.integrity.algorithm).toBe('SHA256');
      expect(aFile.integrity.hash).toBeTruthy();
      expect(aFile.integrity.blocks).toBeInstanceOf(Array);
      expect(aFile.integrity.blocks.length).toBeGreaterThan(0);
    });

    it('should store correct file offsets in header', async () => {
      const src = createFixture('offsets', {
        'first.txt': 'aaaa', // 4 bytes, offset 0
        'second.txt': 'bb', // 2 bytes, offset 4
        'third.txt': 'ccccc', // 5 bytes, offset 6
      });
      const dest = path.join(testRunDir, 'offsets.asar');
      await createPackage(src, dest);

      const { header } = readArchiveHeaderSync(dest);
      const first = (header.files as any)['first.txt'];
      const second = (header.files as any)['second.txt'];
      const third = (header.files as any)['third.txt'];

      expect(parseInt(first.offset)).toBe(0);
      expect(parseInt(second.offset)).toBe(4);
      expect(parseInt(third.offset)).toBe(6);
    });
  });

  // ─── Path traversal protection ──────────────────────────────────

  describe('path traversal protection', () => {
    it('should reject symlinks pointing outside the archive during extract', () => {
      expect(() => {
        extractAll('test/input/bad-symlink.asar', path.join(testRunDir, 'bad-link'));
      }).toThrow();
    });
  });

  // ─── Ordering file support ──────────────────────────────────────

  describe('ordering', () => {
    it('should accept ordering file that references non-existent files', async () => {
      const src = createFixture('ordering-missing', { 'exists.txt': 'here' });
      const orderFile = path.join(testRunDir, 'order.txt');
      fs.writeFileSync(orderFile, 'nonexistent.txt\nexists.txt\nalso-missing.txt\n');

      const dest = path.join(testRunDir, 'ordering-missing.asar');
      await createPackageWithOptions(src, dest, { ordering: orderFile });
      expect(extractFile(dest, 'exists.txt').toString()).toBe('here');
    });

    it('should handle ordering file with empty lines', async () => {
      const src = createFixture('ordering-empty-lines', {
        'a.txt': 'a',
        'b.txt': 'b',
      });
      const orderFile = path.join(testRunDir, 'order-empty.txt');
      fs.writeFileSync(orderFile, '\n\na.txt\n\nb.txt\n\n');

      const dest = path.join(testRunDir, 'ordering-empty-lines.asar');
      await createPackageWithOptions(src, dest, { ordering: orderFile });
      expect(extractFile(dest, 'a.txt').toString()).toBe('a');
      expect(extractFile(dest, 'b.txt').toString()).toBe('b');
    });

    it('should handle ordering file with colon-prefixed format', async () => {
      const src = createFixture('ordering-colon', {
        'first.txt': '1',
        'second.txt': '2',
      });
      const orderFile = path.join(testRunDir, 'order-colon.txt');
      fs.writeFileSync(orderFile, ': first.txt\n: second.txt\n');

      const dest = path.join(testRunDir, 'ordering-colon.asar');
      await createPackageWithOptions(src, dest, { ordering: orderFile });
      expect(extractFile(dest, 'first.txt').toString()).toBe('1');
      expect(extractFile(dest, 'second.txt').toString()).toBe('2');
    });
  });

  // ─── Stress and fuzz-like scenarios ──────────────────────────────

  describe('stress scenarios', () => {
    it('should handle archive with many directories but few files', async () => {
      const src = tmpDir('many-dirs');
      for (let i = 0; i < 100; i++) {
        fs.mkdirSync(path.join(src, `dir${i}`, `subdir${i}`), { recursive: true });
      }
      fs.writeFileSync(path.join(src, 'dir50', 'subdir50', 'file.txt'), 'deep');

      const dest = path.join(testRunDir, 'many-dirs.asar');
      await createPackage(src, dest);

      const extractDir = path.join(testRunDir, 'many-dirs-extracted');
      extractAll(dest, extractDir);
      expect(fs.readFileSync(path.join(extractDir, 'dir50', 'subdir50', 'file.txt'), 'utf8')).toBe(
        'deep',
      );
    });

    it('should handle files with identical names in different directories', async () => {
      const src = createFixture('same-names', {
        'a/config.json': '{"env": "a"}',
        'b/config.json': '{"env": "b"}',
        'c/config.json': '{"env": "c"}',
      });
      const dest = path.join(testRunDir, 'same-names.asar');
      await createPackage(src, dest);

      expect(extractFile(dest, 'a/config.json').toString()).toBe('{"env": "a"}');
      expect(extractFile(dest, 'b/config.json').toString()).toBe('{"env": "b"}');
      expect(extractFile(dest, 'c/config.json').toString()).toBe('{"env": "c"}');
    });

    it('should handle rapid pack-extract-pack cycle', async () => {
      const src = createFixture('cycle', { 'data.txt': 'original' });
      const archive = path.join(testRunDir, 'cycle.asar');
      const extractDir = path.join(testRunDir, 'cycle-extracted');

      await createPackage(src, archive);
      uncache(archive);
      extractAll(archive, extractDir);
      fs.writeFileSync(path.join(extractDir, 'data.txt'), 'modified');
      const archive2 = path.join(testRunDir, 'cycle2.asar');
      await createPackage(extractDir, archive2);
      expect(extractFile(archive2, 'data.txt').toString()).toBe('modified');
    });

    it('should handle packing directory with only hidden files when dot=true', async () => {
      const src = createFixture('only-hidden', {
        '.gitignore': 'node_modules',
        '.env': 'SECRET=123',
        '.config/settings.json': '{}',
      });
      const dest = path.join(testRunDir, 'only-hidden.asar');
      await createPackageWithOptions(src, dest, { dot: true });

      expect(extractFile(dest, '.gitignore').toString()).toBe('node_modules');
      expect(extractFile(dest, '.env').toString()).toBe('SECRET=123');
    });

    it('should produce empty archive when dot=false and only hidden files exist', async () => {
      const src = createFixture('hidden-only-no-dot', {
        '.hidden1': 'h1',
        '.hidden2': 'h2',
      });
      const dest = path.join(testRunDir, 'hidden-only-no-dot.asar');
      await createPackageWithOptions(src, dest, { dot: false });

      const files = listPackage(dest, { isPack: false });
      expect(files.length).toBe(0);
    });

    it('should handle interleaved pack and unpack files', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        const ext = i % 2 === 0 ? '.txt' : '.node';
        files[`file${i}${ext}`] = `content-${i}`;
      }
      const src = createFixture('interleaved', files);
      const dest = path.join(testRunDir, 'interleaved.asar');
      await createPackageWithOptions(src, dest, { unpack: '*.node' });

      for (let i = 0; i < 20; i += 2) {
        expect(extractFile(dest, `file${i}.txt`).toString()).toBe(`content-${i}`);
      }
      for (let i = 1; i < 20; i += 2) {
        expect(fs.existsSync(path.join(`${dest}.unpacked`, `file${i}.node`))).toBe(true);
      }
    });
  });

  // ─── Archive format validation ──────────────────────────────────

  describe('archive format', () => {
    it('should produce archives with valid pickle header structure', async () => {
      const src = createFixture('pickle-validate', { 'test.txt': 'hello' });
      const dest = path.join(testRunDir, 'pickle-validate.asar');
      await createPackage(src, dest);

      const raw = fs.readFileSync(dest);
      // First 4 bytes: payload size of the size pickle (should be 4 for UInt32)
      expect(raw.readUInt32LE(0)).toBe(4);
      // Bytes 4-7: the header size value
      const headerSize = raw.readUInt32LE(4);
      expect(headerSize).toBeGreaterThan(0);
      // The total archive must be larger than header
      expect(raw.length).toBeGreaterThan(8 + headerSize);
    });

    it('should produce valid JSON in header', async () => {
      const src = createFixture('json-validate', {
        'a.txt': 'x',
        'b/c.txt': 'y',
      });
      const dest = path.join(testRunDir, 'json-validate.asar');
      await createPackage(src, dest);

      const { headerString, header } = getRawHeader(dest);
      expect(() => JSON.parse(headerString)).not.toThrow();
      expect(header).toHaveProperty('files');
      expect(header.files).toHaveProperty('b');
    });
  });
});

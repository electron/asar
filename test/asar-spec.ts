import { describe, it, expect } from 'vitest';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import path from 'node:path';
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
import { crawl } from '../src/crawlfs.js';
import { useTmpDir } from './util/tmpDir.js';

describe('asar', () => {
  const { testRunDir, tmpDir, createFixture } = useTmpDir(uncacheAll);

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

  describe('path traversal protection', () => {
    it('should reject symlinks pointing outside the archive during extract', () => {
      expect(() => {
        extractAll('test/input/bad-symlink.asar', path.join(testRunDir, 'bad-link'));
      }).toThrow();
    });
  });

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
});

import { describe, it, expect } from 'vitest';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import path from 'node:path';

import { createPackage, getRawHeader, uncacheAll } from '../src/asar.js';
import { readArchiveHeaderSync, readFilesystemSync, uncacheFilesystem } from '../src/disk.js';
import { useTmpDir } from './util/tmpDir.js';

describe('disk', () => {
  const { testRunDir, createFixture } = useTmpDir(uncacheAll);

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

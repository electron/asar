import { describe, it, expect } from 'vitest';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { createPackage, getRawHeader, uncacheAll } from '../src/asar.js';
import { getFileIntegrity } from '../src/integrity.js';
import { useTmpDir } from './util/tmpDir.js';

describe('integrity', () => {
  const { testRunDir, createFixture } = useTmpDir(uncacheAll);

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

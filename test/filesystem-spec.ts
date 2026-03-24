import { describe, it, beforeEach, expect } from 'vitest';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import path from 'node:path';
import { createSymlinkedApp } from './util/createSymlinkedApp.js';
import { TEST_APPS_DIR } from './util/constants.js';
import { Filesystem } from '../src/filesystem.js';
import {
  createPackage,
  createPackageWithOptions,
  extractFile,
  getRawHeader,
  listPackage,
  statFile,
  uncacheAll,
} from '../src/asar.js';
import { useTmpDir } from './util/tmpDir.js';

describe('filesystem', () => {
  beforeEach(() => {
    fs.rmSync(TEST_APPS_DIR, { recursive: true, force: true });
  });

  it('should does not throw an error when the src path includes a symbol link', async () => {
    const { appPath, varPath } = await createSymlinkedApp('filesystem');
    const filesystem = new Filesystem(varPath);
    expect(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'), false);
    }).not.toThrow();
  });

  describe('tree operations', () => {
    const { testRunDir, tmpDir, createFixture } = useTmpDir(uncacheAll);

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
});

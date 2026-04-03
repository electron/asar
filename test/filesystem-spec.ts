import { describe, it, beforeEach, expect } from 'vitest';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import path from 'node:path';
import { createSymlinkedApp } from './util/createSymlinkedApp.js';
import { TEST_APPS_DIR } from './util/constants.js';
import { Filesystem, FilesystemEntry } from '../src/filesystem.js';
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

  describe('symlink recursion protection', () => {
    function createFilesystemWithHeader(header: FilesystemEntry): Filesystem {
      const filesystem = new Filesystem('/tmp/fake-asar');
      filesystem.setHeader(header, 0);
      return filesystem;
    }

    it('should detect direct circular symlink (A → B → A) in getFile', () => {
      // dirA/fileA is a symlink to dirB/fileB, and dirB/fileB is a symlink to dirA/fileA
      const header: FilesystemEntry = {
        files: {
          dirA: {
            files: {
              fileA: { link: 'dirB/fileB' },
            },
          },
          dirB: {
            files: {
              fileB: { link: 'dirA/fileA' },
            },
          },
        },
      };
      const filesystem = createFilesystemWithHeader(header);
      expect(() => filesystem.getFile('dirA/fileA')).toThrow(/circular symlink detected/);
    });

    it('should detect circular symlink chain (A → B → C → A) in getFile', () => {
      const header: FilesystemEntry = {
        files: {
          dirA: {
            files: {
              fileA: { link: 'dirB/fileB' },
            },
          },
          dirB: {
            files: {
              fileB: { link: 'dirC/fileC' },
            },
          },
          dirC: {
            files: {
              fileC: { link: 'dirA/fileA' },
            },
          },
        },
      };
      const filesystem = createFilesystemWithHeader(header);
      expect(() => filesystem.getFile('dirA/fileA')).toThrow(/circular symlink detected/);
    });

    it('should detect self-referencing symlink in getFile', () => {
      const header: FilesystemEntry = {
        files: {
          dir: {
            files: {
              file: { link: 'dir/file' },
            },
          },
        },
      };
      const filesystem = createFilesystemWithHeader(header);
      expect(() => filesystem.getFile('dir/file')).toThrow(/circular symlink detected/);
    });

    it('should detect circular symlink in getNode via directory link', () => {
      // A directory that is a symlink creating a cycle
      const header: FilesystemEntry = {
        files: {
          dirA: { link: 'dirB' },
          dirB: { link: 'dirA' },
        },
      };
      const filesystem = createFilesystemWithHeader(header);
      expect(() => filesystem.getNode('dirA/somefile')).toThrow(
        /circular symlink detected|too many levels of symbolic links/,
      );
    });

    it('should enforce max symlink depth limit in getFile', () => {
      // Build a chain of 50 symlinks: file0 → file1 → file2 → ... → file49 → file50 (not a link)
      // This exceeds the 40 depth limit
      const files: Record<string, any> = {};
      for (let i = 0; i < 50; i++) {
        files[`file${i}`] = { link: `file${i + 1}` };
      }
      files['file50'] = {
        unpacked: false,
        executable: false,
        offset: '0',
        size: 10,
        integrity: { algorithm: 'SHA256', hash: 'abc', blockSize: 0, blocks: [] },
      };
      const header: FilesystemEntry = { files };
      const filesystem = createFilesystemWithHeader(header);
      expect(() => filesystem.getFile('file0')).toThrow(/too many levels of symbolic links/);
    });

    it('should resolve symlinks within the depth limit', () => {
      // Build a chain of 5 symlinks: file0 → file1 → ... → file5 (real file)
      const files: Record<string, any> = {};
      for (let i = 0; i < 5; i++) {
        files[`file${i}`] = { link: `file${i + 1}` };
      }
      files['file5'] = {
        unpacked: false,
        executable: false,
        offset: '0',
        size: 10,
        integrity: { algorithm: 'SHA256', hash: 'abc', blockSize: 0, blocks: [] },
      };
      const header: FilesystemEntry = { files };
      const filesystem = createFilesystemWithHeader(header);
      const result = filesystem.getFile('file0');
      expect(result).toBeDefined();
      expect('size' in result).toBe(true);
    });

    it('should not follow symlinks when followLinks is false', () => {
      const header: FilesystemEntry = {
        files: {
          dirA: {
            files: {
              fileA: { link: 'dirB/fileB' },
            },
          },
          dirB: {
            files: {
              fileB: { link: 'dirA/fileA' },
            },
          },
        },
      };
      const filesystem = createFilesystemWithHeader(header);
      // Should not throw because we're not following links
      const result = filesystem.getFile('dirA/fileA', false);
      expect(result).toBeDefined();
      expect('link' in result).toBe(true);
    });
  });

  describe('insertLink symlink validation', () => {
    it('should reject symlinks that resolve outside the package via deeply nested traversal', () => {
      const src = '/package';
      const filesystem = new Filesystem(src);
      expect(() => {
        filesystem.insertLink(
          path.join(src, 'a', 'b', 'link'),
          false,
          path.join(src, 'a', 'b'), // parentPath
          '../../../etc/passwd', // symlink traverses out of /package
          src,
        );
      }).toThrow('links out of the package');
    });

    it('should reject symlinks that traverse out via normalized path (e.g. valid/../../../etc/passwd)', () => {
      const src = '/package';
      const filesystem = new Filesystem(src);
      expect(() => {
        filesystem.insertLink(
          path.join(src, 'link'),
          false,
          path.join(src, 'subdir'), // parentPath
          'valid/../../../etc/passwd', // symlink that normalizes to ../../etc/passwd
          src,
        );
      }).toThrow('links out of the package');
    });

    it('should reject symlinks that directly traverse out with ..', () => {
      const src = '/package';
      const filesystem = new Filesystem(src);
      expect(() => {
        filesystem.insertLink(path.join(src, 'link'), false, src, '../../etc/passwd', src);
      }).toThrow('links out of the package');
    });

    it('should allow symlinks that stay within the package', () => {
      const src = '/package';
      const filesystem = new Filesystem(src);
      expect(() => {
        filesystem.insertLink(
          path.join(src, 'link'),
          false,
          path.join(src, 'subdir'), // parentPath
          '../other-file.txt', // resolves to /package/other-file.txt
          src,
        );
      }).not.toThrow();
    });

    it('should allow symlinks to files in subdirectories', () => {
      const src = '/package';
      const filesystem = new Filesystem(src);
      expect(() => {
        filesystem.insertLink(path.join(src, 'link'), false, src, 'subdir/file.txt', src);
      }).not.toThrow();
    });
  });
});

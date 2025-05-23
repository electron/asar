import assert from 'node:assert';
import { wrappedFs as fs } from '../lib/wrapped-fs.js';
import os from 'node:os';
import {
  createPackage,
  createPackageFromStreams,
  createPackageWithOptions,
  extractAll,
  extractFile,
  listPackage,
  statFile,
} from '../lib/asar.js';
import { compDirs } from './util/compareDirectories.js';
import { compFileLists } from './util/compareFileLists.js';
import { compFiles, isSymbolicLinkSync } from './util/compareFiles.js';
import { transformStream as transform } from './util/transformStream.js';

import { TEST_APPS_DIR } from './util/constants.js';
import { verifySmartUnpack } from './util/verifySmartUnpack.js';
import { createReadStreams } from './util/createReadStreams.js';

async function assertPackageListEquals(actualList, expectedFilename) {
  const expected = await fs.readFile(expectedFilename, 'utf8');
  return compFileLists(actualList.join('\n'), expected);
}

describe('api', function () {
  beforeEach(() => {
    fs.rmSync(TEST_APPS_DIR, { recursive: true, force: true });
  });

  it('should create archive from directory', async () => {
    await createPackage('test/input/packthis/', 'tmp/packthis-api.asar');
    await verifySmartUnpack('tmp/packthis-api.asar');
    return compFiles('tmp/packthis-api.asar', 'test/expected/packthis.asar');
  });
  if (os.platform() === 'win32') {
    it('should create archive with windows-style path separators', async () => {
      await createPackage('test\\input\\packthis\\', 'tmp\\packthis-api.asar');
      return compFiles('tmp/packthis-api.asar', 'test/expected/packthis.asar');
    });
  }
  it('should create archive from directory (without hidden files)', async () => {
    await createPackageWithOptions('test/input/packthis/', 'tmp/packthis-without-hidden-api.asar', {
      dot: false,
    });
    await verifySmartUnpack('tmp/packthis-without-hidden-api.asar');
    return compFiles(
      'tmp/packthis-without-hidden-api.asar',
      'test/expected/packthis-without-hidden.asar',
    );
  });
  it('should create archive from directory (with transformed files)', async () => {
    await createPackageWithOptions('test/input/packthis/', 'tmp/packthis-api-transformed.asar', {
      transform,
    });
    await verifySmartUnpack('tmp/packthis-api-transformed.asar');
    return compFiles(
      'tmp/packthis-api-transformed.asar',
      'test/expected/packthis-transformed.asar',
    );
  });
  it('should create archive from directory (with nothing packed)', async () => {
    await createPackageWithOptions('test/input/packthis/', 'tmp/packthis-api-unpacked.asar', {
      unpackDir: '**',
    });
    await verifySmartUnpack('tmp/packthis-api-unpacked.asar');
    await compFiles('tmp/packthis-api-unpacked.asar', 'test/expected/packthis-all-unpacked.asar');
    return compDirs('tmp/packthis-api-unpacked.asar.unpacked', 'test/expected/extractthis');
  });
  it('should list files/dirs in archive', async () => {
    return assertPackageListEquals(
      listPackage('test/input/extractthis.asar'),
      'test/expected/extractthis-filelist.txt',
    );
  });
  it('should list files/dirs in archive with option', async () => {
    return assertPackageListEquals(
      listPackage('test/input/extractthis-unpack-dir.asar', { isPack: true }),
      'test/expected/extractthis-filelist-with-option.txt',
    );
  });
  it('should extract a text file from archive', async () => {
    const actual = extractFile('test/input/extractthis.asar', 'dir1/file1.txt').toString('utf8');
    const expected = await fs.readFile('test/expected/extractthis/dir1/file1.txt', 'utf8');
    return compFileLists(actual, expected);
  });
  it('should extract a binary file from archive', async () => {
    const actual = extractFile('test/input/extractthis.asar', 'dir2/file2.png');
    const expected = await fs.readFile('test/expected/extractthis/dir2/file2.png');
    return assert.strictEqual(actual.toString(), expected.toString());
  });
  it('should extract a binary file from archive with unpacked files', async () => {
    const actual = extractFile('test/input/extractthis-unpack.asar', 'dir2/file2.png');
    const expected = await fs.readFile('test/expected/extractthis/dir2/file2.png');
    return assert.strictEqual(actual.toString(), expected.toString());
  });
  it('should extract an archive', async () => {
    extractAll('test/input/extractthis.asar', 'tmp/extractthis-api/');
    return compDirs('tmp/extractthis-api/', 'test/expected/extractthis');
  });
  it('should extract an archive with unpacked files', async () => {
    extractAll('test/input/extractthis-unpack.asar', 'tmp/extractthis-unpack-api/');
    return compDirs('tmp/extractthis-unpack-api/', 'test/expected/extractthis');
  });
  it('should extract a binary file from archive with unpacked files', async () => {
    const actual = extractFile('test/input/extractthis-unpack-dir.asar', 'dir1/file1.txt');
    const expected = await fs.readFile('test/expected/extractthis/dir1/file1.txt');
    assert.strictEqual(actual.toString(), expected.toString());
  });
  it('should extract an archive with unpacked dirs', async () => {
    extractAll('test/input/extractthis-unpack-dir.asar', 'tmp/extractthis-unpack-dir-api/');
    return compDirs('tmp/extractthis-unpack-dir-api/', 'test/expected/extractthis');
  });

  // We don't extract symlinks on Windows, so skip these tests
  if (os.platform() !== 'win32') {
    it('should extract an archive with symlink', async () => {
      assert.strictEqual(isSymbolicLinkSync('test/input/packthis-with-symlink/real.txt'), true);
      await createPackageWithOptions(
        'test/input/packthis-with-symlink/',
        'tmp/packthis-with-symlink.asar',
        { dot: false },
      );
      extractAll('tmp/packthis-with-symlink.asar', 'tmp/packthis-with-symlink/');
      return compFiles(
        'tmp/packthis-with-symlink/real.txt',
        'test/input/packthis-with-symlink/real.txt',
      );
    });
    it('should extract an archive with symlink having the same prefix', async () => {
      assert.strictEqual(
        isSymbolicLinkSync('test/input/packthis-with-symlink-same-prefix/real.txt'),
        true,
      );
      await createPackageWithOptions(
        'test/input/packthis-with-symlink-same-prefix/',
        'tmp/packthis-with-symlink-same-prefix.asar',
        { dot: false },
      );
      extractAll(
        'tmp/packthis-with-symlink-same-prefix.asar',
        'tmp/packthis-with-symlink-same-prefix/',
      );
      return compFiles(
        'tmp/packthis-with-symlink-same-prefix/real.txt',
        'test/input/packthis-with-symlink-same-prefix/real.txt',
      );
    });
    it('should not extract an archive with a bad symlink', async () => {
      assert.throws(() => {
        extractAll('test/input/bad-symlink.asar', 'tmp/bad-symlink/');
      });
    });
    it('should throw when packaging symlink outside package', async function () {
      const src = 'test/input/packthis-with-bad-symlink/';
      const out = 'tmp/packthis-read-stream-bad-symlink.asar';
      assert.rejects(async () => {
        await createPackage(src, out);
      });
    });
  }
  it('should handle multibyte characters in paths', async () => {
    await createPackageWithOptions(
      'test/input/packthis-unicode-path/',
      'tmp/packthis-unicode-path.asar',
      {
        globOptions: {
          nosort: true,
        },
      },
    );
    await verifySmartUnpack('tmp/packthis-unicode-path.asar');
    return compFiles('tmp/packthis-unicode-path.asar', 'test/expected/packthis-unicode-path.asar');
  });
  it('should create package from array of NodeJS.ReadableStreams', async () => {
    const src = 'test/input/packthis-glob/';
    const streams = await createReadStreams(src);

    const out = 'tmp/packthis-read-stream.asar';
    await createPackageFromStreams(out, streams);
    await verifySmartUnpack(out);
    await compFiles(out, 'test/expected/packthis-read-stream.asar');
    extractAll(out, 'tmp/extractthis-read-stream/');
    return compDirs('tmp/extractthis-read-stream/', src);
  });

  it('should create package from array of NodeJS.ReadableStreams with valid symlinks', async function () {
    if (os.platform() === 'win32') {
      this.skip();
    }
    const src = 'test/input/packthis-with-symlink/';
    const streams = await createReadStreams(src);

    const out = 'tmp/packthis-read-stream-symlink.asar';
    await createPackageFromStreams(out, streams);
    await verifySmartUnpack(out);
    await compFiles(out, 'test/expected/packthis-read-stream-symlink.asar');
    extractAll(out, 'tmp/extractthis-read-stream-symlink/');
    return compDirs('tmp/extractthis-read-stream-symlink/', src);
  });
  it('should throw when using NodeJS.ReadableStreams with symlink outside package', async function () {
    const src = 'test/input/packthis-with-bad-symlink/';
    const streams = await createReadStreams(src);

    assert.rejects(async () => {
      await createPackageFromStreams(out, streams);
    });
  });
  it('should extract a text file from archive with multibyte characters in path', async () => {
    const actual = extractFile(
      'test/expected/packthis-unicode-path.asar',
      'dir1/女の子.txt',
    ).toString('utf8');
    const expected = await fs.readFile('test/input/packthis-unicode-path/dir1/女の子.txt', 'utf8');
    return compFileLists(actual, expected);
  });
  it('should create files/directories whose names are properties of Object.prototype', async () => {
    await createPackage(
      'test/input/packthis-object-prototype/',
      'tmp/packthis-object-prototype.asar',
    );
    return compFiles(
      'tmp/packthis-object-prototype.asar',
      'test/expected/packthis-object-prototype.asar',
    );
  });
  it('should extract files/directories whose names are properties of Object.prototype', () => {
    extractAll('test/expected/packthis-object-prototype.asar', 'tmp/packthis-object-prototype/');
    return compDirs('test/input/packthis-object-prototype/', 'tmp/packthis-object-prototype');
  });
  it('should stat a symlinked file', async () => {
    const stats = statFile('test/input/stat-symlink.asar', 'real.txt', true);
    return assert.strictEqual(stats.link, undefined);
  });
});

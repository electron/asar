import assert from 'assert';
import os from 'os';
import { FilesystemLinkEntry } from '../lib/filesystem';
import fs from '../lib/wrapped-fs';
import compDirs from './util/compareDirectories';
import compFileLists from './util/compareFileLists';
import { compFiles, isSymbolicLinkSync } from './util/compareFiles';
import transform from './util/transformStream';
import { verifySmartUnpack } from './util/verifySmartUnpack';

const asar = require('../src/asar');

async function assertPackageListEquals(actualList: string[], expectedFilename: string) {
  const expected = await fs.readFile(expectedFilename, 'utf8');
  return compFileLists(actualList.join('\n'), expected);
}

describe('api', function () {
  it('should create archive from directory', async () => {
    await asar.createPackage('test/input/packthis/', 'tmp/packthis-api.asar');
    return compFiles('tmp/packthis-api.asar', 'test/expected/packthis.asar');
  });
  it.ifWindows('should create archive with windows-style path separators', async () => {
    await asar.createPackage('test\\input\\packthis\\', 'tmp\\packthis-api.asar');
    return compFiles('tmp/packthis-api.asar', 'test/expected/packthis.asar');
  });
  it('should create archive from directory (without hidden files)', async () => {
    await asar.createPackageWithOptions(
      'test/input/packthis/',
      'tmp/packthis-without-hidden-api.asar',
      { dot: false },
    );
    return compFiles(
      'tmp/packthis-without-hidden-api.asar',
      'test/expected/packthis-without-hidden.asar',
    );
  });
  it('should create archive from directory (with transformed files)', async () => {
    await asar.createPackageWithOptions(
      'test/input/packthis/',
      'tmp/packthis-api-transformed.asar',
      { transform },
    );
    return compFiles(
      'tmp/packthis-api-transformed.asar',
      'test/expected/packthis-transformed.asar',
    );
  });
  it('should create archive from directory (with nothing packed)', async () => {
    const out = 'tmp/packthis-api-unpacked.asar';
    await asar.createPackageWithOptions('test/input/packthis/', out, {
      unpackDir: '**',
    });
    await verifySmartUnpack(out);
  });
  it('should list files/dirs in archive', async () => {
    return assertPackageListEquals(
      asar.listPackage('test/input/extractthis.asar', { isPack: false }),
      'test/expected/extractthis-filelist.txt',
    );
  });
  it('should list files/dirs in archive with option', async () => {
    return assertPackageListEquals(
      asar.listPackage('test/input/extractthis-unpack-dir.asar', { isPack: true }),
      'test/expected/extractthis-filelist-with-option.txt',
    );
  });
  it('should extract a text file from archive', async () => {
    const actual = asar
      .extractFile('test/input/extractthis.asar', 'dir1/file1.txt')
      .toString('utf8');
    const expected = await fs.readFile('test/expected/extractthis/dir1/file1.txt', 'utf8');
    return compFileLists(actual, expected);
  });
  it('should extract a binary file from archive', async () => {
    const actual = asar.extractFile('test/input/extractthis.asar', 'dir2/file2.png');
    const expected = await fs.readFile('test/expected/extractthis/dir2/file2.png');
    return assert.strictEqual(actual.toString(), expected.toString());
  });
  it('should extract a binary file from archive with unpacked files', async () => {
    const actual = asar.extractFile('test/input/extractthis-unpack.asar', 'dir2/file2.png');
    const expected = await fs.readFile('test/expected/extractthis/dir2/file2.png');
    return assert.strictEqual(actual.toString(), expected.toString());
  });
  it('should extract an archive', async () => {
    asar.extractAll('test/input/extractthis.asar', 'tmp/extractthis-api/');
    return compDirs('tmp/extractthis-api/', 'test/expected/extractthis');
  });
  it('should extract an archive with unpacked files', async () => {
    asar.extractAll('test/input/extractthis-unpack.asar', 'tmp/extractthis-unpack-api/');
    return compDirs('tmp/extractthis-unpack-api/', 'test/expected/extractthis');
  });
  it('should extract a binary file from archive with unpacked files', async () => {
    const actual = asar.extractFile('test/input/extractthis-unpack-dir.asar', 'dir1/file1.txt');
    const expected = await fs.readFile('test/expected/extractthis/dir1/file1.txt');
    assert.strictEqual(actual.toString(), expected.toString());
  });
  it('should extract an archive with unpacked dirs', async () => {
    asar.extractAll('test/input/extractthis-unpack-dir.asar', 'tmp/extractthis-unpack-dir-api/');
    return compDirs('tmp/extractthis-unpack-dir-api/', 'test/expected/extractthis');
  });

  // We don't extract symlinks on Windows, so skip these tests
  it.ifNotWindows('should extract an archive with symlink', async () => {
    assert.strictEqual(isSymbolicLinkSync('test/input/packthis-with-symlink/real.txt'), true);
    await asar.createPackageWithOptions(
      'test/input/packthis-with-symlink/',
      'tmp/packthis-with-symlink.asar',
      { dot: false },
    );
    asar.extractAll('tmp/packthis-with-symlink.asar', 'tmp/packthis-with-symlink/');
    return compFiles(
      'tmp/packthis-with-symlink/real.txt',
      'test/input/packthis-with-symlink/real.txt',
    );
  });
  it.ifNotWindows('should extract an archive with symlink having the same prefix', async () => {
    assert.strictEqual(
      isSymbolicLinkSync('test/input/packthis-with-symlink-same-prefix/real.txt'),
      true,
    );
    await asar.createPackageWithOptions(
      'test/input/packthis-with-symlink-same-prefix/',
      'tmp/packthis-with-symlink-same-prefix.asar',
      { dot: false },
    );
    asar.extractAll(
      'tmp/packthis-with-symlink-same-prefix.asar',
      'tmp/packthis-with-symlink-same-prefix/',
    );
    return compFiles(
      'tmp/packthis-with-symlink-same-prefix/real.txt',
      'test/input/packthis-with-symlink-same-prefix/real.txt',
    );
  });
  it.ifNotWindows('should not extract an archive with a bad symlink', async () => {
    assert.throws(() => {
      asar.extractAll('test/input/bad-symlink.asar', 'tmp/bad-symlink/');
    });
  });
  it('should handle multibyte characters in paths', async () => {
    await asar.createPackageWithOptions(
      'test/input/packthis-unicode-path/',
      'tmp/packthis-unicode-path.asar',
      {
        globOptions: {
          nosort: true,
        },
      },
    );
    return compFiles('tmp/packthis-unicode-path.asar', 'test/expected/packthis-unicode-path.asar');
  });
  it('should extract a text file from archive with multibyte characters in path', async () => {
    const actual = asar
      .extractFile('test/expected/packthis-unicode-path.asar', 'dir1/女の子.txt')
      .toString('utf8');
    const expected = await fs.readFile('test/input/packthis-unicode-path/dir1/女の子.txt', 'utf8');
    return compFileLists(actual, expected);
  });
  it('should create files/directories whose names are properties of Object.prototype', async () => {
    await asar.createPackage(
      'test/input/packthis-object-prototype/',
      'tmp/packthis-object-prototype.asar',
    );
    return compFiles(
      'tmp/packthis-object-prototype.asar',
      'test/expected/packthis-object-prototype.asar',
    );
  });
  it('should extract files/directories whose names are properties of Object.prototype', () => {
    asar.extractAll(
      'test/expected/packthis-object-prototype.asar',
      'tmp/packthis-object-prototype/',
    );
    return compDirs('test/input/packthis-object-prototype/', 'tmp/packthis-object-prototype');
  });
  it('should export all functions also in the default export', () => {
    const topLevelFunctions = Object.keys(asar).filter((key) => typeof asar[key] === 'function');
    const defaultExportFunctions = Object.keys(asar.default).filter(
      (key) => typeof asar.default[key] === 'function',
    );

    assert.deepStrictEqual(topLevelFunctions, defaultExportFunctions);
  });
  it('should stat a symlinked file', async () => {
    const stats = asar.statFile(
      'test/input/stat-symlink.asar',
      'real.txt',
      true,
    ) as FilesystemLinkEntry;
    return assert.strictEqual(stats.link, undefined);
  });
});

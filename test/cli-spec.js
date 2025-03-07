'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('../lib/wrapped-fs').default;
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const rimraf = require('rimraf');

const compDirs = require('./util/compareDirectories');
const compFileLists = require('./util/compareFileLists');
const { compFiles } = require('./util/compareFiles');
const createSymlinkApp = require('./util/createSymlinkApp');
const { verifySmartUnpack } = require('./util/verifySmartUnpack');
const { TEST_APPS_DIR } = require('./util/constants');

const exec = promisify(childProcess.exec);

async function execAsar(args) {
  return exec(`node bin/asar ${args}`);
}

async function assertAsarOutputMatches(args, expectedFilename) {
  const [{ stdout }, expectedContents] = await Promise.all([
    execAsar(args),
    fs.readFile(expectedFilename, 'utf8'),
  ]);
  return compFileLists(stdout, `${expectedContents}\n`);
}

describe('command line interface', function () {
  beforeEach(() => {
    rimraf.sync(TEST_APPS_DIR, fs);
  });

  it('should create archive from directory', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-cli.asar');
    await compFiles('tmp/packthis-cli.asar', 'test/expected/packthis.asar');
  });
  if (os.platform() === 'win32') {
    it('should create archive from directory with windows-style path separators', async () => {
      await execAsar('p test\\input\\packthis\\ tmp\\packthis-cli.asar');
      await compFiles('tmp/packthis-cli.asar', 'test/expected/packthis.asar');
    });
  }
  it('should create archive from directory without hidden files', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-without-hidden-cli.asar --exclude-hidden');
    await compFiles(
      'tmp/packthis-without-hidden-cli.asar',
      'test/expected/packthis-without-hidden.asar',
    );
  });
  it('should create archive from directory with unpacked files', async () => {
    await execAsar(
      'p test/input/packthis/ tmp/packthis-unpack-cli.asar --unpack *.png --exclude-hidden',
    );
    await verifySmartUnpack('tmp/packthis-unpack-cli.asar');
    await compFiles('tmp/packthis-unpack-cli.asar', 'test/expected/packthis-unpack.asar');
  });
  it('should list files/dirs in archive', async () => {
    return assertAsarOutputMatches(
      'l test/input/extractthis.asar',
      'test/expected/extractthis-filelist.txt',
    );
  });
  it('should list files/dirs in archive with unpacked files', async () => {
    return assertAsarOutputMatches(
      'l test/input/extractthis-unpack.asar',
      'test/expected/extractthis-filelist.txt',
    );
  });
  it('should list files/dirs with multibyte characters in path', async () => {
    return assertAsarOutputMatches(
      'l test/expected/packthis-unicode-path.asar',
      'test/expected/packthis-unicode-path-filelist.txt',
    );
  });
  // we need a way to set a path to extract to first, otherwise we pollute our project dir
  // or we fake it by setting our cwd, but I don't like that
  /*
  it('should extract a text file from archive', async () => {
    await execAsar('ef test/input/extractthis.asar dir1/file1.txt')
    const actual = await fs.readFile('tmp/file1.txt', 'utf8')
    let expected = await fs.readFile('test/expected/extractthis/dir1/file1.txt', 'utf8')
    // on windows replace crlf with lf
    if (os.platform() === 'win32') {
      expected = expected.replace(/\r\n/g, '\n')
    }
    assert.strictEqual(actual, expected)
  })

    it('should extract a binary file from archive', async () => {
      await execAsar('ef test/input/extractthis.asar dir2/file2.png')
      const actual = await fs.readFile('tmp/file2.png', 'utf8')
      const expected = await fs.readFile('test/expected/extractthis/dir2/file2.png', 'utf8')
      assert.strictEqual(actual, expected)
    })
  */
  it('should extract an archive', async () => {
    await execAsar('e test/input/extractthis.asar tmp/extractthis-cli/');
    return compDirs('tmp/extractthis-cli/', 'test/expected/extractthis');
  });
  it('should extract an archive with unpacked files', async () => {
    await execAsar('e test/input/extractthis-unpack.asar tmp/extractthis-unpack-cli/');
    return compDirs('tmp/extractthis-unpack-cli/', 'test/expected/extractthis');
  });
  it("should throw an error when trying to extract a file that doesn't exist in the archive", async () => {
    await assert.rejects(
      execAsar('ef test/input/extractthis.asar this-file-doesnt-exist.404'),
      /"(.*?)" was not found in this archive/,
    );
  });
  it('should create archive from directory with unpacked dirs', async () => {
    await execAsar(
      'p test/input/packthis/ tmp/packthis-unpack-dir-cli.asar --unpack-dir dir2 --exclude-hidden',
    );
    await verifySmartUnpack('tmp/packthis-unpack-dir-cli.asar');
    return compFiles('tmp/packthis-unpack-dir-cli.asar', 'test/expected/packthis-unpack-dir.asar');
  });
  it('should create archive from directory with unpacked dirs specified by glob pattern', async () => {
    const tmpFile = 'tmp/packthis-unpack-dir-glob-cli.asar';
    await execAsar(
      `p test/input/packthis-glob/ ${tmpFile} --unpack-dir "{x1,x2}" --exclude-hidden`,
    );
    await verifySmartUnpack(tmpFile);
    return compFiles(tmpFile, 'test/expected/packthis-unpack-dir-glob.asar');
  });
  it('should create archive from directory with unpacked dirs specified by globstar pattern', async () => {
    const tmpFile = 'tmp/packthis-unpack-dir-globstar-cli.asar';
    await execAsar(
      `p test/input/packthis-glob/ ${tmpFile} --unpack-dir "**/{x1,x2}" --exclude-hidden`,
    );
    await verifySmartUnpack(tmpFile);
    return compFiles(tmpFile, 'test/expected/packthis-unpack-dir-globstar.asar');
  });
  it('should create archive from directory with unpacked dirs specified by foo/{bar,baz} style pattern', async () => {
    const tmpFile = 'tmp/packthis-unpack-dir-globstar-cli.asar';
    await execAsar(
      `p test/input/packthis-glob/ ${tmpFile} --unpack-dir "y3/{x1,z1}" --exclude-hidden`,
    );
    await verifySmartUnpack(tmpFile);
  });
  it('should list files/dirs in archive with unpacked dirs', async () => {
    return assertAsarOutputMatches(
      'l test/expected/packthis-unpack-dir.asar',
      'test/expected/extractthis-filelist.txt',
    );
  });
  it('should list files/dirs in archive with unpacked dirs & is-pack option', async () => {
    return assertAsarOutputMatches(
      'l --is-pack test/expected/packthis-unpack-dir.asar',
      'test/expected/extractthis-filelist-with-option.txt',
    );
  });
  it('should extract an archive with unpacked dirs', async () => {
    await execAsar('e test/input/extractthis-unpack-dir.asar tmp/extractthis-unpack-dir/');
    return compDirs('tmp/extractthis-unpack-dir/', 'test/expected/extractthis');
  });
  it('should create archive from directory with unpacked dirs and files', async () => {
    await execAsar(
      'p test/input/packthis/ tmp/packthis-unpack-dir-file-cli.asar --unpack *.png --unpack-dir dir2 --exclude-hidden',
    );
    await verifySmartUnpack('tmp/packthis-unpack-dir-file-cli.asar');
    return compFiles(
      'tmp/packthis-unpack-dir-file-cli.asar',
      'test/expected/packthis-unpack-dir.asar',
    );
  });
  it('should create archive from directory with unpacked subdirs and files using minimatch', async () => {
    await execAsar(
      'p test/input/packthis-subdir/ tmp/packthis-unpack-subdir-cli.asar --unpack *.txt --unpack-dir "{dir2/subdir,dir2/subdir}" --exclude-hidden',
    );
    await verifySmartUnpack('tmp/packthis-unpack-subdir-cli.asar');
  });
  it('should unpack static framework with all underlying symlinks unpacked', async () => {
    const { testPath } = await createSymlinkApp('app');
    await execAsar(
      `p ${testPath} tmp/packthis-with-symlink1.asar --unpack *.txt --unpack-dir var --exclude-hidden`,
    );

    await verifySmartUnpack('tmp/packthis-with-symlink1.asar');
  });
  it('should respect ordering file (format: "${filepath}")', async () => {
    const { testPath, filesOrdering } = await createSymlinkApp('app-order1', {
      'file1.txt': 'data1',
      'file2.txt': 'data2',
      'file3.txt': 'data3',
    });

    const orderingPath = path.join(testPath, '../ordered-app-ordering1.txt');
    const data = filesOrdering.reduce((prev, curr) => {
      return `${prev}${curr}\n`;
    }, '');
    await fs.writeFile(orderingPath, data);

    await execAsar(
      `p ${testPath} tmp/packthis-with-symlink2.asar --ordering=${orderingPath} --exclude-hidden`,
    );
    await verifySmartUnpack('tmp/packthis-with-symlink2.asar');
  });
  it('should respect ordering file (format: ": ${filepath}")', async () => {
    const { testPath, filesOrdering } = await createSymlinkApp('app-order2', {
      'file1.txt': 'data1',
      'file2.txt': 'data2',
      'file3.txt': 'data3',
    });

    const orderingPath = path.join(testPath, '../ordered-app-ordering2.txt');
    const data = filesOrdering.reduce((prev, curr) => {
      return `${prev}: ${curr}\n`;
    }, '');
    await fs.writeFile(orderingPath, data);

    await execAsar(
      `p ${testPath} tmp/packthis-with-symlink3.asar --ordering=${orderingPath} --exclude-hidden`,
    );
    await verifySmartUnpack('tmp/packthis-with-symlink3.asar');
  });
  it('should respect ordering file (format: "${random number} : ${filepath}")', async () => {
    const { testPath, filesOrdering } = await createSymlinkApp('app-order3', {
      'file1.txt': 'data1',
      'file2.txt': 'data2',
      'file3.txt': 'data3',
    });

    const orderingPath = path.join(testPath, '../ordered-app-ordering3.txt');
    const data = filesOrdering.reduce((prev, curr) => {
      return `${prev}${Math.floor(Math.random() * 1000)} :  ${curr} \n`;
    }, '');
    await fs.writeFile(orderingPath, data);

    await execAsar(
      `p ${testPath} tmp/packthis-with-symlink4.asar --ordering=${orderingPath} --exclude-hidden`,
    );
    await verifySmartUnpack('tmp/packthis-with-symlink4.asar');
  });
});

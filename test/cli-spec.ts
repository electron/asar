import assert from 'assert';
import childProcess from 'child_process';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import fs from '../lib/wrapped-fs';

import compFileLists from './util/compareFileLists';
import { compFiles } from './util/compareFiles';
import createSymlinkApp from './util/createTestApp';
import { verifyFileTree, verifySmartUnpack } from './util/verifySmartUnpack';

const exec = promisify(childProcess.exec);

async function execAsar(args: string) {
  return exec(`node bin/asar ${args}`);
}

async function assertAsarOutputMatches(args: string, expectedFilename: string) {
  const [{ stdout }, expectedContents] = await Promise.all([
    execAsar(args),
    fs.readFile(expectedFilename, 'utf8'),
  ]);
  return compFileLists(stdout, `${expectedContents}\n`);
}

describe('command line interface', function () {
  it('should create archive from directory', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-cli.asar');
    await verifySmartUnpack('tmp/packthis-cli.asar');
  });
  it.ifWindows(
    'should create archive from directory with windows-style path separators',
    async () => {
      await execAsar('p test\\input\\packthis\\ tmp\\packthis-cli.asar');
      await verifySmartUnpack('tmp/packthis-cli.asar');
    },
  );
  it('should create archive from directory without hidden files', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-without-hidden-cli.asar --exclude-hidden');
    await verifySmartUnpack('tmp/packthis-without-hidden-cli.asar');
  });
  it('should create archive from directory with unpacked files', async () => {
    await execAsar(
      'p test/input/packthis/ tmp/packthis-unpack-cli.asar --unpack *.png --exclude-hidden',
    );
    await verifySmartUnpack('tmp/packthis-unpack-cli.asar');
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
    expect(await verifyFileTree('tmp/extractthis-cli/')).toMatchSnapshot();
  });
  it('should extract an archive with unpacked files', async () => {
    await execAsar('e test/input/extractthis-unpack.asar tmp/extractthis-unpack-cli/');
    expect(await verifyFileTree('tmp/extractthis-unpack-cli/')).toMatchSnapshot();
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
  });
  it('should create archive from directory with unpacked dirs specified by glob pattern', async () => {
    const tmpFile = 'tmp/packthis-unpack-dir-glob-cli.asar';
    await execAsar(
      `p test/input/packthis-glob/ ${tmpFile} --unpack-dir "{x1,x2}" --exclude-hidden`,
    );
    await verifySmartUnpack(tmpFile);
  });
  it('should create archive from directory with unpacked dirs specified by globstar pattern', async () => {
    const tmpFile = 'tmp/packthis-unpack-dir-globstar-cli.asar';
    await execAsar(
      `p test/input/packthis-glob/ ${tmpFile} --unpack-dir "**/{x1,x2}" --exclude-hidden`,
    );
    await verifySmartUnpack(tmpFile);
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
    expect(await verifyFileTree('tmp/extractthis-unpack-cli/')).toMatchSnapshot();
  });
  it('should create archive from directory with unpacked dirs and files', async () => {
    await execAsar(
      'p test/input/packthis/ tmp/packthis-unpack-dir-file-cli.asar --unpack *.png --unpack-dir dir2 --exclude-hidden',
    );
    await verifySmartUnpack('tmp/packthis-unpack-dir-file-cli.asar');
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
      `p ${testPath} tmp/packthis-with-symlink.asar --unpack *.txt --unpack-dir var --exclude-hidden`,
    );
    await verifySmartUnpack('tmp/packthis-with-symlink.asar');
  });
});

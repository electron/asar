'use strict'

const assert = require('assert')
const childProcess = require('child_process')
const fs = require('../lib/wrapped-fs')
const os = require('os')
const path = require('path')
const { promisify } = require('util')
const rimraf = require('rimraf')

const compDirs = require('./util/compareDirectories')
const compFileLists = require('./util/compareFileLists')
const compFiles = require('./util/compareFiles')

childProcess.exec = promisify(childProcess.exec)

async function execAsar (args) {
  return childProcess.exec(`node bin/asar ${args}`)
}

async function assertAsarOutputMatches (args, expectedFilename) {
  const [{ stdout }, expectedContents] = await Promise.all([execAsar(args), fs.readFile(expectedFilename, 'utf8')])
  return compFileLists(stdout, `${expectedContents}\n`)
}

describe('command line interface', function () {
  beforeEach(() => { rimraf.sync(path.join(__dirname, '..', 'tmp'), fs) })

  it('should create archive from directory', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-cli.asar')
    await compFiles('tmp/packthis-cli.asar', 'test/expected/packthis.asar')
  })
  if (os.platform() === 'win32') {
    it('should create archive from directory with windows-style path separators', async () => {
      await execAsar('p test\\input\\packthis\\ tmp\\packthis-cli.asar')
      await compFiles('tmp/packthis-cli.asar', 'test/expected/packthis.asar')
    })
  }
  it('should create archive from directory without hidden files', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-without-hidden-cli.asar --exclude-hidden')
    await compFiles('tmp/packthis-without-hidden-cli.asar', 'test/expected/packthis-without-hidden.asar')
  })
  it('should create archive from directory with unpacked files', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-unpack-cli.asar --unpack *.png --exclude-hidden')
    assert.ok(fs.existsSync('tmp/packthis-unpack-cli.asar.unpacked/dir2/file2.png'))
    await compFiles('tmp/packthis-unpack-cli.asar', 'test/expected/packthis-unpack.asar')
  })
  it('should list files/dirs in archive', async () => {
    return assertAsarOutputMatches('l test/input/extractthis.asar', 'test/expected/extractthis-filelist.txt')
  })
  it('should list files/dirs in archive with unpacked files', async () => {
    return assertAsarOutputMatches('l test/input/extractthis-unpack.asar', 'test/expected/extractthis-filelist.txt')
  })
  it('should list files/dirs with multibyte characters in path', async () => {
    return assertAsarOutputMatches('l test/expected/packthis-unicode-path.asar', 'test/expected/packthis-unicode-path-filelist.txt')
  })
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
    await execAsar('e test/input/extractthis.asar tmp/extractthis-cli/')
    return compDirs('tmp/extractthis-cli/', 'test/expected/extractthis')
  })
  it('should extract an archive with unpacked files', async () => {
    await execAsar('e test/input/extractthis-unpack.asar tmp/extractthis-unpack-cli/')
    return compDirs('tmp/extractthis-unpack-cli/', 'test/expected/extractthis')
  })
  it('should create archive from directory with unpacked dirs', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-unpack-dir-cli.asar --unpack-dir dir2 --exclude-hidden')
    assert.ok(fs.existsSync('tmp/packthis-unpack-dir-cli.asar.unpacked/dir2/file2.png'))
    assert.ok(fs.existsSync('tmp/packthis-unpack-dir-cli.asar.unpacked/dir2/file3.txt'))
    return compFiles('tmp/packthis-unpack-dir-cli.asar', 'test/expected/packthis-unpack-dir.asar')
  })
  it('should create archive from directory with unpacked dirs specified by glob pattern', async () => {
    const tmpFile = 'tmp/packthis-unpack-dir-glob-cli.asar'
    const tmpUnpacked = 'tmp/packthis-unpack-dir-glob-cli.asar.unpacked'
    await execAsar(`p test/input/packthis-glob/ ${tmpFile} --unpack-dir "{x1,x2}" --exclude-hidden`)
    assert.ok(fs.existsSync(tmpUnpacked + '/x1/file1.txt'))
    assert.ok(fs.existsSync(tmpUnpacked + '/x2/file2.txt'))
    return compFiles(tmpFile, 'test/expected/packthis-unpack-dir-glob.asar')
  })
  it('should create archive from directory with unpacked dirs specified by globstar pattern', async () => {
    const tmpFile = 'tmp/packthis-unpack-dir-globstar-cli.asar'
    const tmpUnpacked = 'tmp/packthis-unpack-dir-globstar-cli.asar.unpacked'
    await execAsar(`p test/input/packthis-glob/ ${tmpFile} --unpack-dir "**/{x1,x2}" --exclude-hidden`)
    assert.ok(fs.existsSync(tmpUnpacked + '/x1/file1.txt'))
    assert.ok(fs.existsSync(tmpUnpacked + '/x2/file2.txt'))
    assert.ok(fs.existsSync(tmpUnpacked + '/y3/x1/file4.txt'))
    assert.ok(fs.existsSync(tmpUnpacked + '/y3/z1/x2/file5.txt'))
    return compFiles(tmpFile, 'test/expected/packthis-unpack-dir-globstar.asar')
  })
  it('should create archive from directory with unpacked dirs specified by foo/{bar,baz} style pattern', async () => {
    const tmpFile = 'tmp/packthis-unpack-dir-globstar-cli.asar'
    const tmpUnpacked = 'tmp/packthis-unpack-dir-globstar-cli.asar.unpacked'
    await execAsar(`p test/input/packthis-glob/ ${tmpFile} --unpack-dir "y3/{x1,z1}" --exclude-hidden`)
    assert.ok(fs.existsSync(path.join(tmpUnpacked, 'y3/x1/file4.txt')))
    assert.ok(fs.existsSync(path.join(tmpUnpacked, 'y3/z1/x2/file5.txt')))
  })
  it('should list files/dirs in archive with unpacked dirs', async () => {
    return assertAsarOutputMatches('l test/expected/packthis-unpack-dir.asar', 'test/expected/extractthis-filelist.txt')
  })
  it('should list files/dirs in archive with unpacked dirs & is-pack option', async () => {
    return assertAsarOutputMatches('l test/expected/packthis-unpack-dir.asar --is-pack', 'test/expected/extractthis-filelist-with-option.txt')
  })
  it('should extract an archive with unpacked dirs', async () => {
    await execAsar('e test/input/extractthis-unpack-dir.asar tmp/extractthis-unpack-dir/')
    return compDirs('tmp/extractthis-unpack-dir/', 'test/expected/extractthis')
  })
  it('should create archive from directory with unpacked dirs and files', async () => {
    await execAsar('p test/input/packthis/ tmp/packthis-unpack-dir-file-cli.asar --unpack *.png --unpack-dir dir2 --exclude-hidden')
    assert.ok(fs.existsSync('tmp/packthis-unpack-dir-file-cli.asar.unpacked/dir2/file2.png'))
    assert.ok(fs.existsSync('tmp/packthis-unpack-dir-file-cli.asar.unpacked/dir2/file3.txt'))
    return compFiles('tmp/packthis-unpack-dir-file-cli.asar', 'test/expected/packthis-unpack-dir.asar')
  })
  it('should create archive from directory with unpacked subdirs and files', async () => {
    await execAsar('p test/input/packthis-subdir/ tmp/packthis-unpack-subdir-cli.asar --unpack *.txt --unpack-dir dir2/subdir --exclude-hidden')
    assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/file0.txt'))
    assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir1/file1.txt'))
    assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir2/subdir/file2.png'))
    assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir2/subdir/file3.txt'))
  })
})

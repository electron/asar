'use strict'

const { promisify } = require('util')

const assert = require('assert')
const { exec } = require('mz/child_process')
const fs = promisify(process.versions.electron ? require('original-fs') : require('fs'))
const os = require('os')
const path = require('path')
const rimraf = promisify(require('rimraf'))

const compDirs = require('./util/compareDirectories')
const compFileLists = require('./util/compareFileLists')
const compFiles = require('./util/compareFiles')

function execAsar (args) {
  return exec(`node bin/asar ${args}`)
}

function assertAsarOutputMatches (args, expectedFilename) {
  return Promise.all([execAsar(args), fs.readFile(expectedFilename, 'utf8')])
    .then(([stdout, expectedContents]) => compFileLists(stdout.join(''), `${expectedContents}\n`))
}

describe('command line interface', function () {
  beforeEach(() => { rimraf.sync(path.join(__dirname, '..', 'tmp'), fs) })

  it('should create archive from directory', () => {
    return execAsar('p test/input/packthis/ tmp/packthis-cli.asar')
      .then(() => compFiles('tmp/packthis-cli.asar', 'test/expected/packthis.asar'))
  })
  if (os.platform() === 'win32') {
    it('should create archive from directory with windows-style path separators', () => {
      return execAsar('p test\\input\\packthis\\ tmp\\packthis-cli.asar')
        .then(() => compFiles('tmp/packthis-cli.asar', 'test/expected/packthis.asar'))
    })
  }
  it('should create archive from directory without hidden files', () => {
    return execAsar('p test/input/packthis/ tmp/packthis-without-hidden-cli.asar --exclude-hidden')
      .then(() => compFiles('tmp/packthis-without-hidden-cli.asar', 'test/expected/packthis-without-hidden.asar'))
  })
  it('should create archive from directory with unpacked files', () => {
    return execAsar('p test/input/packthis/ tmp/packthis-unpack-cli.asar --unpack *.png --exclude-hidden')
      .then(() => {
        assert.ok(fs.existsSync('tmp/packthis-unpack-cli.asar.unpacked/dir2/file2.png'))
        return compFiles('tmp/packthis-unpack-cli.asar', 'test/expected/packthis-unpack.asar')
      })
  })
  it('should list files/dirs in archive', () => {
    return assertAsarOutputMatches('l test/input/extractthis.asar', 'test/expected/extractthis-filelist.txt')
  })
  it('should list files/dirs in archive with unpacked files', () => {
    return assertAsarOutputMatches('l test/input/extractthis-unpack.asar', 'test/expected/extractthis-filelist.txt')
  })
  it('should list files/dirs with multibyte characters in path', () => {
    return assertAsarOutputMatches('l test/expected/packthis-unicode-path.asar', 'test/expected/packthis-unicode-path-filelist.txt')
  })
  // we need a way to set a path to extract to first, otherwise we pollute our project dir
  // or we fake it by setting our cwd, but I don't like that
  /*
  it('should extract a text file from archive', () => {
    return execAsar('ef test/input/extractthis.asar dir1/file1.txt')
      .then(() => {
        const actual = fs.readFileSync('tmp/file1.txt', 'utf8')
        let expected = fs.readFileSync('test/expected/extractthis/dir1/file1.txt', 'utf8')
        // on windows replace crlf with lf
        if (os.platform() === 'win32') {
          expected = expected.replace(/\r\n/g, '\n')
        }
        return assert.strictEqual(actual, expected)
      })
  })

    it('should extract a binary file from archive', () => {
      return execAsar('ef test/input/extractthis.asar dir2/file2.png')
        .then(() => {
          const actual = fs.readFileSync('tmp/file2.png', 'utf8')
          const expected = fs.readFileSync('test/expected/extractthis/dir2/file2.png', 'utf8')
          assert.strictEqual(actual, expected)
        })
    })
  */
  it('should extract an archive', () => {
    return execAsar('e test/input/extractthis.asar tmp/extractthis-cli/')
      .then(() => compDirs('tmp/extractthis-cli/', 'test/expected/extractthis'))
  })
  it('should extract an archive with unpacked files', () => {
    return execAsar('e test/input/extractthis-unpack.asar tmp/extractthis-unpack-cli/')
      .then(() => compDirs('tmp/extractthis-unpack-cli/', 'test/expected/extractthis'))
  })
  it('should create archive from directory with unpacked dirs', () => {
    return execAsar('p test/input/packthis/ tmp/packthis-unpack-dir-cli.asar --unpack-dir dir2 --exclude-hidden')
      .then(() => {
        assert.ok(fs.existsSync('tmp/packthis-unpack-dir-cli.asar.unpacked/dir2/file2.png'))
        assert.ok(fs.existsSync('tmp/packthis-unpack-dir-cli.asar.unpacked/dir2/file3.txt'))
        return compFiles('tmp/packthis-unpack-dir-cli.asar', 'test/expected/packthis-unpack-dir.asar')
      })
  })
  it('should create archive from directory with unpacked dirs specified by glob pattern', () => {
    const tmpFile = 'tmp/packthis-unpack-dir-glob-cli.asar'
    const tmpUnpacked = 'tmp/packthis-unpack-dir-glob-cli.asar.unpacked'
    return execAsar(`p test/input/packthis-glob/ ${tmpFile} --unpack-dir "{x1,x2}" --exclude-hidden`)
      .then(() => {
        assert.ok(fs.existsSync(tmpUnpacked + '/x1/file1.txt'))
        assert.ok(fs.existsSync(tmpUnpacked + '/x2/file2.txt'))
        return compFiles(tmpFile, 'test/expected/packthis-unpack-dir-glob.asar')
      })
  })
  it('should create archive from directory with unpacked dirs specified by globstar pattern', () => {
    const tmpFile = 'tmp/packthis-unpack-dir-globstar-cli.asar'
    const tmpUnpacked = 'tmp/packthis-unpack-dir-globstar-cli.asar.unpacked'
    return execAsar(`p test/input/packthis-glob/ ${tmpFile} --unpack-dir "**/{x1,x2}" --exclude-hidden`)
      .then(() => {
        assert.ok(fs.existsSync(tmpUnpacked + '/x1/file1.txt'))
        assert.ok(fs.existsSync(tmpUnpacked + '/x2/file2.txt'))
        assert.ok(fs.existsSync(tmpUnpacked + '/y3/x1/file4.txt'))
        assert.ok(fs.existsSync(tmpUnpacked + '/y3/z1/x2/file5.txt'))
        return compFiles(tmpFile, 'test/expected/packthis-unpack-dir-globstar.asar')
      })
  })
  it('should create archive from directory with unpacked dirs specified by foo/{bar,baz} style pattern', () => {
    const tmpFile = 'tmp/packthis-unpack-dir-globstar-cli.asar'
    const tmpUnpacked = 'tmp/packthis-unpack-dir-globstar-cli.asar.unpacked'
    return execAsar(`p test/input/packthis-glob/ ${tmpFile} --unpack-dir "y3/{x1,z1}" --exclude-hidden`)
      .then(() => {
        assert.ok(fs.existsSync(path.join(tmpUnpacked, 'y3/x1/file4.txt')))
        assert.ok(fs.existsSync(path.join(tmpUnpacked, 'y3/z1/x2/file5.txt')))
      })
  })
  it('should list files/dirs in archive with unpacked dirs', () => {
    return assertAsarOutputMatches('l test/expected/packthis-unpack-dir.asar', 'test/expected/extractthis-filelist.txt')
  })
  it('should list files/dirs in archive with unpacked dirs & is-pack option', () => {
    return assertAsarOutputMatches('l test/expected/packthis-unpack-dir.asar --is-pack', 'test/expected/extractthis-filelist-with-option.txt')
  })
  it('should extract an archive with unpacked dirs', () => {
    return execAsar('e test/input/extractthis-unpack-dir.asar tmp/extractthis-unpack-dir/')
      .then(() => compDirs('tmp/extractthis-unpack-dir/', 'test/expected/extractthis'))
  })
  it('should create archive from directory with unpacked dirs and files', () => {
    return execAsar('p test/input/packthis/ tmp/packthis-unpack-dir-file-cli.asar --unpack *.png --unpack-dir dir2 --exclude-hidden')
      .then(() => {
        assert.ok(fs.existsSync('tmp/packthis-unpack-dir-file-cli.asar.unpacked/dir2/file2.png'))
        assert.ok(fs.existsSync('tmp/packthis-unpack-dir-file-cli.asar.unpacked/dir2/file3.txt'))
        return compFiles('tmp/packthis-unpack-dir-file-cli.asar', 'test/expected/packthis-unpack-dir.asar')
      })
  })
  it('should create archive from directory with unpacked subdirs and files', () => {
    return execAsar('p test/input/packthis-subdir/ tmp/packthis-unpack-subdir-cli.asar --unpack *.txt --unpack-dir dir2/subdir --exclude-hidden')
      .then(() => {
        assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/file0.txt'))
        assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir1/file1.txt'))
        assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir2/subdir/file2.png'))
        assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir2/subdir/file3.txt'))
      })
  })
})

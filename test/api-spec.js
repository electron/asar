'use strict'

const assert = require('assert')
const fs = require('../lib/wrapped-fs')
const os = require('os')
const path = require('path')
const rimraf = require('rimraf')

const asar = require('..')
const compDirs = require('./util/compareDirectories')
const compFileLists = require('./util/compareFileLists')
const compFiles = require('./util/compareFiles')
const transform = require('./util/transformStream')

async function assertPackageListEquals (actualList, expectedFilename) {
  const expected = await fs.readFile(expectedFilename, 'utf8')
  return compFileLists(actualList.join('\n'), expected)
}

describe('api', function () {
  beforeEach(() => { rimraf.sync(path.join(__dirname, '..', 'tmp'), fs) })

  it('should create archive from directory', async () => {
    await asar.createPackage('test/input/packthis/', 'tmp/packthis-api.asar')
    return compFiles('tmp/packthis-api.asar', 'test/expected/packthis.asar')
  })
  if (os.platform() === 'win32') {
    it('should create archive with windows-style path separators', async () => {
      await asar.createPackage('test\\input\\packthis\\', 'tmp\\packthis-api.asar')
      return compFiles('tmp/packthis-api.asar', 'test/expected/packthis.asar')
    })
  }
  it('should create archive from directory (without hidden files)', async () => {
    await asar.createPackageWithOptions('test/input/packthis/', 'tmp/packthis-without-hidden-api.asar', { dot: false })
    return compFiles('tmp/packthis-without-hidden-api.asar', 'test/expected/packthis-without-hidden.asar')
  })
  it('should create archive from directory (with transformed files)', async () => {
    await asar.createPackageWithOptions('test/input/packthis/', 'tmp/packthis-api-transformed.asar', { transform })
    return compFiles('tmp/packthis-api-transformed.asar', 'test/expected/packthis-transformed.asar')
  })
  it('should create archive from directory (with nothing packed)', async () => {
    await asar.createPackageWithOptions('test/input/packthis/', 'tmp/packthis-api-unpacked.asar', { unpackDir: '**' })
    await compFiles('tmp/packthis-api-unpacked.asar', 'test/expected/packthis-all-unpacked.asar')
    return compDirs('tmp/packthis-api-unpacked.asar.unpacked', 'test/expected/extractthis')
  })
  it('should list files/dirs in archive', async () => {
    return assertPackageListEquals(asar.listPackage('test/input/extractthis.asar'), 'test/expected/extractthis-filelist.txt')
  })
  it('should list files/dirs in archive with option', async () => {
    return assertPackageListEquals(asar.listPackage('test/input/extractthis-unpack-dir.asar', { isPack: true }), 'test/expected/extractthis-filelist-with-option.txt')
  })
  it('should extract a text file from archive', async () => {
    const actual = asar.extractFile('test/input/extractthis.asar', 'dir1/file1.txt').toString('utf8')
    const expected = await fs.readFile('test/expected/extractthis/dir1/file1.txt', 'utf8')
    return compFileLists(actual, expected)
  })
  it('should extract a binary file from archive', async () => {
    const actual = asar.extractFile('test/input/extractthis.asar', 'dir2/file2.png')
    const expected = await fs.readFile('test/expected/extractthis/dir2/file2.png')
    return assert.strictEqual(actual.toString(), expected.toString())
  })
  it('should extract a binary file from archive with unpacked files', async () => {
    const actual = asar.extractFile('test/input/extractthis-unpack.asar', 'dir2/file2.png')
    const expected = await fs.readFile('test/expected/extractthis/dir2/file2.png')
    return assert.strictEqual(actual.toString(), expected.toString())
  })
  it('should extract an archive', async () => {
    asar.extractAll('test/input/extractthis.asar', 'tmp/extractthis-api/')
    return compDirs('tmp/extractthis-api/', 'test/expected/extractthis')
  })
  it('should extract an archive with unpacked files', async () => {
    asar.extractAll('test/input/extractthis-unpack.asar', 'tmp/extractthis-unpack-api/')
    return compDirs('tmp/extractthis-unpack-api/', 'test/expected/extractthis')
  })
  it('should extract a binary file from archive with unpacked files', async () => {
    const actual = asar.extractFile('test/input/extractthis-unpack-dir.asar', 'dir1/file1.txt')
    const expected = await fs.readFile('test/expected/extractthis/dir1/file1.txt')
    assert.strictEqual(actual.toString(), expected.toString())
  })
  it('should extract an archive with unpacked dirs', async () => {
    asar.extractAll('test/input/extractthis-unpack-dir.asar', 'tmp/extractthis-unpack-dir-api/')
    return compDirs('tmp/extractthis-unpack-dir-api/', 'test/expected/extractthis')
  })
  it('should handle multibyte characters in paths', async () => {
    await asar.createPackageWithOptions('test/input/packthis-unicode-path/', 'tmp/packthis-unicode-path.asar', {
      globOptions: {
        nosort: true
      }
    })
    return compFiles('tmp/packthis-unicode-path.asar', 'test/expected/packthis-unicode-path.asar')
  })
  it('should extract a text file from archive with multibyte characters in path', async () => {
    const actual = asar.extractFile('test/expected/packthis-unicode-path.asar', 'dir1/女の子.txt').toString('utf8')
    const expected = await fs.readFile('test/input/packthis-unicode-path/dir1/女の子.txt', 'utf8')
    return compFileLists(actual, expected)
  })
  it('should create files/directories whose names are properties of Object.prototype', async () => {
    await asar.createPackage('test/input/packthis-object-prototype/', 'tmp/packthis-object-prototype.asar')
    return compFiles('tmp/packthis-object-prototype.asar', 'test/expected/packthis-object-prototype.asar')
  })
  it('should extract files/directories whose names are properties of Object.prototype', () => {
    asar.extractAll('test/expected/packthis-object-prototype.asar', 'tmp/packthis-object-prototype/')
    return compDirs('test/input/packthis-object-prototype/', 'tmp/packthis-object-prototype')
  })
})

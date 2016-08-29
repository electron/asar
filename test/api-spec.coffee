assert = require 'assert'
fs = require 'fs'
os = require 'os'

asar = require '../lib/asar'
compDirs = require './util/compareDirectories'
compFiles = require './util/compareFiles'
transform = require './util/transformStream'

describe 'api', ->
  it 'should create archive from directory', (done) ->
    asar.createPackage 'test/input/packthis/', 'tmp/packthis-api.asar', (error) ->
      done compFiles 'tmp/packthis-api.asar', 'test/expected/packthis.asar'
      return
    return
  it 'should create archive from directory (without hidden files)', (done) ->
    asar.createPackageWithOptions 'test/input/packthis/', 'tmp/packthis-without-hidden-api.asar', {dot: false}, (error) ->
      done compFiles 'tmp/packthis-api.asar', 'test/expected/packthis.asar'
      return
    return
  it 'should create archive from directory (with transformed files)', (done) ->
    asar.createPackageWithOptions 'test/input/packthis/', 'tmp/packthis-api-transformed.asar', {transform}, (error) ->
      done compFiles 'tmp/packthis-api-transformed.asar', 'test/expected/packthis-transformed.asar'
      return
    return
  it 'should list files/dirs in archive', ->
    actual = asar.listPackage('test/input/extractthis.asar').join('\n')
    expected = fs.readFileSync 'test/expected/extractthis-filelist.txt', 'utf8'
    # on windows replace slashes with backslashes and crlf with lf
    if os.platform() is 'win32'
      expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n')
    assert.equal actual, expected
  it 'should extract a text file from archive', ->
    actual = asar.extractFile('test/input/extractthis.asar', 'dir1/file1.txt').toString 'utf8'
    expected = fs.readFileSync 'test/expected/extractthis/dir1/file1.txt', 'utf8'
    # on windows replace crlf with lf
    expected = expected.replace /\r\n/g, '\n' if os.platform() is 'win32'
    assert.equal actual, expected
  it 'should extract a binary file from archive', ->
    actual = asar.extractFile 'test/input/extractthis.asar', 'dir2/file2.png'
    expected = fs.readFileSync 'test/expected/extractthis/dir2/file2.png', 'utf8'
    assert.equal actual, expected
  it 'should extract a binary file from archive with unpacked files', ->
    actual = asar.extractFile 'test/input/extractthis-unpack.asar', 'dir2/file2.png'
    expected = fs.readFileSync 'test/expected/extractthis/dir2/file2.png', 'utf8'
    assert.equal actual, expected
  it 'should extract an archive', (done) ->
    asar.extractAll 'test/input/extractthis.asar', 'tmp/extractthis-api/'
    compDirs 'tmp/extractthis-api/', 'test/expected/extractthis', done
    return
  it 'should extract an archive with unpacked files', (done) ->
    asar.extractAll 'test/input/extractthis-unpack.asar', 'tmp/extractthis-unpack-api/'
    compDirs 'tmp/extractthis-unpack-api/', 'test/expected/extractthis', done
    return
  it 'should extract a binary file from archive with unpacked files', ->
    actual = asar.extractFile 'test/input/extractthis-unpack-dir.asar', 'dir1/file1.txt'
    expected = fs.readFileSync 'test/expected/extractthis/dir1/file1.txt', 'utf8'
    assert.equal actual, expected
  it 'should extract an archive with unpacked dirs', (done) ->
    asar.extractAll 'test/input/extractthis-unpack-dir.asar', 'tmp/extractthis-unpack-dir-api/'
    compDirs 'tmp/extractthis-unpack-dir-api/', 'test/expected/extractthis', done
    return
  it 'should handle multibyte characters in paths', (done) ->
    asar.createPackage 'test/input/packthis-unicode-path/', 'tmp/packthis-unicode-path.asar', (error) ->
      done compFiles 'tmp/packthis-unicode-path.asar', 'test/expected/packthis-unicode-path.asar'
      return
    return
  it 'should extract a text file from archive with multibyte characters in path', ->
    actual = asar.extractFile('test/expected/packthis-unicode-path.asar', 'dir1/女の子.txt').toString 'utf8'
    expected = fs.readFileSync 'test/input/packthis-unicode-path/dir1/女の子.txt', 'utf8'
    # on windows replace crlf with lf
    expected = expected.replace /\r\n/g, '\n' if os.platform() is 'win32'
    assert.equal actual, expected
  return

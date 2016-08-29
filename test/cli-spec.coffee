assert = require 'assert'
{exec} = require 'child_process'
fs = require 'fs'
os = require 'os'

compDirs = require './util/compareDirectories'
compFiles = require './util/compareFiles'

describe 'command line interface', ->
  it 'should create archive from directory', (done) ->
    exec 'node bin/asar p test/input/packthis/ tmp/packthis-cli.asar', (error, stdout, stderr) ->
      done compFiles 'tmp/packthis-cli.asar', 'test/expected/packthis.asar'
      return
    return
  it 'should create archive from directory without hidden files', (done) ->
    exec 'node bin/asar p test/input/packthis/ tmp/packthis-without-hidden-cli.asar --exclude-hidden', (error, stdout, stderr) ->
      done compFiles 'tmp/packthis-without-hidden-cli.asar', 'test/expected/packthis-without-hidden.asar'
      return
    return
  it 'should create archive from directory with unpacked files', (done) ->
    exec 'node bin/asar p test/input/packthis/ tmp/packthis-unpack-cli.asar --unpack *.png --exclude-hidden', (error, stdout, stderr) ->
      assert.ok fs.existsSync 'tmp/packthis-unpack-cli.asar.unpacked/dir2/file2.png'
      done compFiles 'tmp/packthis-unpack-cli.asar', 'test/expected/packthis-unpack.asar'
      return
    return
  it 'should list files/dirs in archive', (done) ->
    exec 'node bin/asar l test/input/extractthis.asar', (error, stdout, stderr) ->
      actual = stdout
      expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8') + '\n'
      # on windows replace slashes with backslashes and crlf with lf
      if os.platform() is 'win32'
        expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n')
      done assert.equal actual, expected
      return
    return
  it 'should list files/dirs in archive with unpacked files', (done) ->
    exec 'node bin/asar l test/input/extractthis-unpack.asar', (error, stdout, stderr) ->
      actual = stdout
      expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8') + '\n'
      # on windows replace slashes with backslashes and crlf with lf
      if os.platform() is 'win32'
        expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n')
      done assert.equal actual, expected
      return
    return
  it 'should list files/dirs with multibyte characters in path', (done) ->
    exec 'node bin/asar l test/expected/packthis-unicode-path.asar', (error, stdout, stderr) ->
      actual = stdout
      expected = fs.readFileSync('test/expected/packthis-unicode-path-filelist.txt', 'utf8') + '\n'
      # on windows replace slashes with backslashes and crlf with lf
      if os.platform() is 'win32'
        expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n')
      done assert.equal actual, expected
      return
    return
  # we need a way to set a path to extract to first, otherwise we pollute our project dir
  # or we fake it by setting our cwd, but I don't like that
  ###
  it('should extract a text file from archive', function(done) {
    exec('node bin/asar ef test/input/extractthis.asar dir1/file1.txt', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/file1.txt', 'utf8');
      var expected = fs.readFileSync('test/expected/extractthis/dir1/file1.txt', 'utf8');
      // on windows replace crlf with lf
      if ('win32' is os.platform())
        expected = expected.replace(/\r\n/g, '\n');
      done(assert.equal(actual, expected));
    });
  });

    it('should extract a binary file from archive', function(done) {
    exec('node bin/asar ef test/input/extractthis.asar dir2/file2.png', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/file2.png', 'utf8');
      var expected = fs.readFileSync('test/expected/extractthis/dir2/file2.png', 'utf8');
      done(assert.equal(actual, expected));
    });
  });
  ###
  it 'should extract an archive', (done) ->
    exec 'node bin/asar e test/input/extractthis.asar tmp/extractthis-cli/', (error, stdout, stderr) ->
      compDirs 'tmp/extractthis-cli/', 'test/expected/extractthis', done
      return
    return
  it 'should extract an archive with unpacked files', (done) ->
    exec 'node bin/asar e test/input/extractthis-unpack.asar tmp/extractthis-unpack-cli/', (error, stdout, stderr) ->
      compDirs 'tmp/extractthis-unpack-cli/', 'test/expected/extractthis', done
      return
    return
  it 'should create archive from directory with unpacked dirs', (done) ->
    exec 'node bin/asar p test/input/packthis/ tmp/packthis-unpack-dir-cli.asar --unpack-dir dir2 --exclude-hidden', (error, stdout, stderr) ->
      assert.ok fs.existsSync 'tmp/packthis-unpack-dir-cli.asar.unpacked/dir2/file2.png'
      assert.ok fs.existsSync 'tmp/packthis-unpack-dir-cli.asar.unpacked/dir2/file3.txt'
      done compFiles 'tmp/packthis-unpack-dir-cli.asar', 'test/expected/packthis-unpack-dir.asar'
      return
    return
  it 'should create archive from directory with unpacked dirs specified by glob pattern', (done) ->
    tmpFile = 'tmp/packthis-unpack-dir-glob-cli.asar'
    tmpUnpacked = 'tmp/packthis-unpack-dir-glob-cli.asar.unpacked'
    exec 'node bin/asar p test/input/packthis-glob/ ' + tmpFile + ' --unpack-dir "{x1,x2}" --exclude-hidden', (error, stdout, stderr) ->
      assert.ok fs.existsSync tmpUnpacked + '/x1/file1.txt'
      assert.ok fs.existsSync tmpUnpacked + '/x2/file2.txt'
      done compFiles tmpFile, 'test/expected/packthis-unpack-dir-glob.asar'
      return
    return
  it 'should create archive from directory with unpacked dirs specified by globstar pattern', (done) ->
    tmpFile = 'tmp/packthis-unpack-dir-globstar-cli.asar'
    tmpUnpacked = 'tmp/packthis-unpack-dir-globstar-cli.asar.unpacked'
    exec 'node bin/asar p test/input/packthis-glob/ ' + tmpFile + ' --unpack-dir "**/{x1,x2}" --exclude-hidden', (error, stdout, stderr) ->
      assert.ok fs.existsSync tmpUnpacked + '/x1/file1.txt'
      assert.ok fs.existsSync tmpUnpacked + '/x2/file2.txt'
      assert.ok fs.existsSync tmpUnpacked + '/y3/x1/file4.txt'
      assert.ok fs.existsSync tmpUnpacked + '/y3/z1/x2/file5.txt'
      done compFiles tmpFile, 'test/expected/packthis-unpack-dir-globstar.asar'
      return
    return
  it 'should list files/dirs in archive with unpacked dirs', (done) ->
    exec 'node bin/asar l tmp/packthis-unpack-dir-cli.asar', (error, stdout, stderr) ->
      actual = stdout
      expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8') + '\n'
      # on windows replace slashes with backslashes and crlf with lf
      if os.platform() is 'win32'
        expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n')
      done assert.equal actual, expected
      return
    return
  it 'should extract an archive with unpacked dirs', (done) ->
    exec 'node bin/asar e test/input/extractthis-unpack-dir.asar tmp/extractthis-unpack-dir/', (error, stdout, stderr) ->
      compDirs 'tmp/extractthis-unpack-dir/', 'test/expected/extractthis', done
      return
    return
  it 'should create archive from directory with unpacked dirs and files', (done) ->
    exec 'node bin/asar p test/input/packthis/ tmp/packthis-unpack-dir-file-cli.asar --unpack *.png --unpack-dir dir2 --exclude-hidden', (error, stdout, stderr) ->
      assert.ok fs.existsSync 'tmp/packthis-unpack-dir-file-cli.asar.unpacked/dir2/file2.png'
      assert.ok fs.existsSync 'tmp/packthis-unpack-dir-file-cli.asar.unpacked/dir2/file3.txt'
      done compFiles 'tmp/packthis-unpack-dir-file-cli.asar', 'test/expected/packthis-unpack-dir.asar'
      return
    return
  it 'should create archive from directory with unpacked subdirs and files', (done) ->
    exec 'node bin/asar p test/input/packthis-subdir/ tmp/packthis-unpack-subdir-cli.asar --unpack *.txt --unpack-dir dir2/subdir --exclude-hidden', (error, stdout, stderr) ->
      assert.ok fs.existsSync 'tmp/packthis-unpack-subdir-cli.asar.unpacked/file0.txt'
      assert.ok fs.existsSync 'tmp/packthis-unpack-subdir-cli.asar.unpacked/dir1/file1.txt'
      assert.ok fs.existsSync 'tmp/packthis-unpack-subdir-cli.asar.unpacked/dir2/subdir/file2.png'
      assert.ok fs.existsSync 'tmp/packthis-unpack-subdir-cli.asar.unpacked/dir2/subdir/file3.txt'
      done()
      return
    return
  return

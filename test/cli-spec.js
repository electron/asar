'use strict';

var assert = require('assert');
var exec = require('child_process').exec;
var fs = require('fs');
var os = require('os');

var compDirs = require('./util/compareDirectories');

describe('command line interface', function() {

  it('should create archive from directory', function(done) {
    exec('node bin/asar p test/input/packthis/ tmp/packthis-cli.asar', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/packthis-cli.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis.asar', 'utf8');
      done(assert.equal(actual, expected));
    });
  });

  it('should create archive from directory without hidden files', function(done) {
    exec('node bin/asar p test/input/packthis/ tmp/packthis-without-hidden-cli.asar --exclude-hidden', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/packthis-without-hidden-cli.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis-without-hidden.asar', 'utf8');
      done(assert.equal(actual, expected));
    });
  });

  it('should create archive from directory with unpacked files', function(done) {
    exec('node bin/asar p test/input/packthis/ tmp/packthis-unpack-cli.asar --unpack *.png --exclude-hidden', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/packthis-unpack-cli.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis-unpack.asar', 'utf8');
      assert.ok(fs.existsSync('tmp/packthis-unpack-cli.asar.unpacked/dir2/file2.png'));
      done(assert.equal(actual, expected));
    });
  });

  it('should list files/dirs in archive', function(done) {
    exec('node bin/asar l test/input/extractthis.asar', function (error, stdout, stderr) {
      var actual = stdout;
      var expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8') + '\n';
      // on windows replace slashes with backslashes and crlf with lf
      if ('win32' === os.platform())
        expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
      done(assert.equal(actual, expected));
    });
  });

  it('should list files/dirs in archive with unpacked files', function(done) {
    exec('node bin/asar l test/input/extractthis-unpack.asar', function (error, stdout, stderr) {
      var actual = stdout;
      var expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8') + '\n';
      // on windows replace slashes with backslashes and crlf with lf
      if ('win32' === os.platform())
        expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
      done(assert.equal(actual, expected));
    });
  });

  // we need a way to set a path to extract to first, otherwise we pollute our project dir
  // or we fake it by setting our cwd, but I don't like that
  /*
  it('should extract a text file from archive', function(done) {
    exec('node bin/asar ef test/input/extractthis.asar dir1/file1.txt', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/file1.txt', 'utf8');
      var expected = fs.readFileSync('test/expected/extractthis/dir1/file1.txt', 'utf8');
      // on windows replace crlf with lf
      if ('win32' === os.platform())
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
  */

  it('should extract an archive', function(done) {
    exec('node bin/asar e test/input/extractthis.asar tmp/extractthis-cli/', function (error, stdout, stderr) {
      compDirs('tmp/extractthis-cli/', 'test/expected/extractthis', done);
    });
  });

  it('should extract an archive with unpacked files', function(done) {
    exec('node bin/asar e test/input/extractthis-unpack.asar tmp/extractthis-unpack-cli/', function (error, stdout, stderr) {
      compDirs('tmp/extractthis-unpack-cli/', 'test/expected/extractthis', done);
    });
  });

  it('should create archive from directory with unpacked dirs', function(done) {
    exec('node bin/asar p test/input/packthis/ tmp/packthis-unpack-dir-cli.asar --unpack-dir dir2 --exclude-hidden', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/packthis-unpack-dir-cli.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis-unpack-dir.asar', 'utf8');
      assert.ok(fs.existsSync('tmp/packthis-unpack-dir-cli.asar.unpacked/dir2/file2.png'));
      assert.ok(fs.existsSync('tmp/packthis-unpack-dir-cli.asar.unpacked/dir2/file3.txt'));
      done(assert.equal(actual, expected));
    });
  });

  it('should list files/dirs in archive with unpacked dirs', function(done) {
    exec('node bin/asar l tmp/packthis-unpack-dir-cli.asar', function (error, stdout, stderr) {
      var actual = stdout;
      var expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8') + '\n';
      // on windows replace slashes with backslashes and crlf with lf
      if ('win32' === os.platform())
        expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
      done(assert.equal(actual, expected));
    });
  });

  it('should extract an archive with unpacked dirs', function(done) {
    exec('node bin/asar e test/input/extractthis-unpack-dir.asar tmp/extractthis-unpack-dir/', function (error, stdout, stderr) {
      compDirs('tmp/extractthis-unpack-dir/', 'test/expected/extractthis', done);
    });
  });

  it('should create archive from directory with unpacked dirs and files', function(done) {
    exec('node bin/asar p test/input/packthis/ tmp/packthis-unpack-dir-file-cli.asar --unpack *.png --unpack-dir dir2 --exclude-hidden', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/packthis-unpack-dir-file-cli.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis-unpack-dir.asar', 'utf8');
      assert.ok(fs.existsSync('tmp/packthis-unpack-dir-file-cli.asar.unpacked/dir2/file2.png'));
      assert.ok(fs.existsSync('tmp/packthis-unpack-dir-file-cli.asar.unpacked/dir2/file3.txt'));
      done(assert.equal(actual, expected));
    });
  });

  it('should create archive from directory with unpacked subdirs and files', function(done) {
    exec('node bin/asar p test/input/packthis-subdir/ tmp/packthis-unpack-subdir-cli.asar --unpack *.txt --unpack-dir dir2/subdir --exclude-hidden', function (error, stdout, stderr) {
      assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/file0.txt'));
      assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir1/file1.txt'));
      assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir2/subdir/file2.png'));
      assert.ok(fs.existsSync('tmp/packthis-unpack-subdir-cli.asar.unpacked/dir2/subdir/file3.txt'));
      done();
    });
  });

});

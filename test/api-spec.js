'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');

var asar = require('../lib/asar');
var compDirs = require('./util/compareDirectories');

describe('api', function() {

  it('should create archive from directory', function(done) {
    asar.createPackage('test/input/packthis/', 'tmp/packthis-api.asar', function (error) {
      var actual = fs.readFileSync('tmp/packthis-api.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis.asar', 'utf8');
      done(assert.equal(actual, expected));
    });
  });

  it('should create archive from directory (without hidden files)', function(done) {
    asar.createPackageWithOptions('test/input/packthis/', 'tmp/packthis-without-hidden-api.asar', {
      dot: false
    }, function (error) {
      var actual = fs.readFileSync('tmp/packthis-api.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis.asar', 'utf8');
      done(assert.equal(actual, expected));
    });
  });

  it('should list files/dirs in archive', function() {
    var actual = asar.listPackage('test/input/extractthis.asar').join('\n');
    var expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8');
    // on windows replace slashes with backslashes and crlf with lf
    if ('win32' === os.platform())
      expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
    return assert.equal(actual, expected);
  });

  it('should extract a text file from archive', function() {
    var actual = asar.extractFile('test/input/extractthis.asar', 'dir1/file1.txt').toString('utf8');
    var expected = fs.readFileSync('test/expected/extractthis/dir1/file1.txt', 'utf8');
    // on windows replace crlf with lf
    if ('win32' === os.platform())
      expected = expected.replace(/\r\n/g, '\n');
    return assert.equal(actual, expected);
  });

  it('should extract a binary file from archive', function() {
    var actual = asar.extractFile('test/input/extractthis.asar', 'dir2/file2.png');
    var expected = fs.readFileSync('test/expected/extractthis/dir2/file2.png', 'utf8');
    return assert.equal(actual, expected);
  });

  it('should extract a binary file from archive with unpacked files', function() {
    var actual = asar.extractFile('test/input/extractthis-unpack.asar', 'dir2/file2.png');
    var expected = fs.readFileSync('test/expected/extractthis/dir2/file2.png', 'utf8');
    return assert.equal(actual, expected);
  });

  it('should extract an archive', function(done) {
    asar.extractAll('test/input/extractthis.asar','tmp/extractthis-api/');
    compDirs('tmp/extractthis-api/', 'test/expected/extractthis', done);
  });

  it('should extract an archive with unpacked files', function(done) {
    asar.extractAll('test/input/extractthis-unpack.asar','tmp/extractthis-unpack-api/');
    compDirs('tmp/extractthis-unpack-api/', 'test/expected/extractthis', done);
  });

  it('should extract a binary file from archive with unpacked files', function() {
    var actual = asar.extractFile('test/input/extractthis-unpack-dir.asar', 'dir1/file1.txt');
    var expected = fs.readFileSync('test/expected/extractthis/dir1/file1.txt', 'utf8');
    return assert.equal(actual, expected);
  });

  it('should extract an archive with unpacked dirs', function(done) {
    asar.extractAll('test/input/extractthis-unpack-dir.asar','tmp/extractthis-unpack-dir-api/');
    compDirs('tmp/extractthis-unpack-dir-api/', 'test/expected/extractthis', done);
  });

});

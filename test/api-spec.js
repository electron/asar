'use strict';
var assert = require('assert');
var fs = require('fs');
var os = require('os');

var asar = require('../src/asar');
var compDirs = require('./util/compareDirectories');
var compFiles = require('./util/compareFiles');
var transform = require('./util/transformStream');

describe('api', function() {
  it('should create archive from directory', function(done) {
    asar.createPackage('test/input/packthis/', 'tmp/packthis-api.asar', function(error) {
      done(compFiles('tmp/packthis-api.asar', 'test/expected/packthis.asar'));
    });
  });
  it('should create archive from directory (without hidden files)', function(done) {
    asar.createPackageWithOptions('test/input/packthis/', 'tmp/packthis-without-hidden-api.asar', {dot: false}, function(error) {
      done(compFiles('tmp/packthis-api.asar', 'test/expected/packthis.asar'));
    });
  });
  it('should create archive from directory (with transformed files)', function(done) {
    asar.createPackageWithOptions('test/input/packthis/', 'tmp/packthis-api-transformed.asar', {transform}, function(error) {
      done(compFiles('tmp/packthis-api-transformed.asar', 'test/expected/packthis-transformed.asar'));
    });
  });
  it('should list files/dirs in archive', function() {
    var actual = asar.listPackage('test/input/extractthis.asar').join('\n');
    var expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8');
    // on windows replace slashes with backslashes and crlf with lf
    if (os.platform() === 'win32') {
      expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
    }
    return assert.equal(actual, expected);
  });
  it('should extract a text file from archive', function() {
    var actual = asar.extractFile('test/input/extractthis.asar', 'dir1/file1.txt').toString('utf8');
    var expected = fs.readFileSync('test/expected/extractthis/dir1/file1.txt', 'utf8');
    // on windows replace crlf with lf
    if (os.platform() === 'win32') { expected = expected.replace(/\r\n/g, '\n'); }
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
    asar.extractAll('test/input/extractthis.asar', 'tmp/extractthis-api/');
    compDirs('tmp/extractthis-api/', 'test/expected/extractthis', done);
  });
  it('should extract an archive with unpacked files', function(done) {
    asar.extractAll('test/input/extractthis-unpack.asar', 'tmp/extractthis-unpack-api/');
    compDirs('tmp/extractthis-unpack-api/', 'test/expected/extractthis', done);
  });
  it('should extract a binary file from archive with unpacked files', function() {
    var actual = asar.extractFile('test/input/extractthis-unpack-dir.asar', 'dir1/file1.txt');
    var expected = fs.readFileSync('test/expected/extractthis/dir1/file1.txt', 'utf8');
    return assert.equal(actual, expected);
  });
  it('should extract an archive with unpacked dirs', function(done) {
    asar.extractAll('test/input/extractthis-unpack-dir.asar', 'tmp/extractthis-unpack-dir-api/');
    compDirs('tmp/extractthis-unpack-dir-api/', 'test/expected/extractthis', done);
  });
  it('should handle multibyte characters in paths', function(done) {
    asar.createPackage('test/input/packthis-unicode-path/', 'tmp/packthis-unicode-path.asar', function(error) {
      done(compFiles('tmp/packthis-unicode-path.asar', 'test/expected/packthis-unicode-path.asar'));
    });
  });
  it('should extract a text file from archive with multibyte characters in path', function() {
    var actual = asar.extractFile('test/expected/packthis-unicode-path.asar', 'dir1/女の子.txt').toString('utf8');
    var expected = fs.readFileSync('test/input/packthis-unicode-path/dir1/女の子.txt', 'utf8');
    // on windows replace crlf with lf
    if (os.platform() === 'win32') { expected = expected.replace(/\r\n/g, '\n'); }
    return assert.equal(actual, expected);
  });
});

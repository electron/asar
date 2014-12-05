'use strict';

var assert = require('assert');
var exec = require('child_process').exec;
var fs = require('fs');
var os = require('os');

describe('command line interface', function() {
  
  it('should create archive from directory', function(done) {
    exec('node bin/asar p test/input/packthis/ tmp/packthis-cli.asar', function (error, stdout, stderr) {
      var actual = fs.readFileSync('tmp/packthis-cli.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis.asar', 'utf8');
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

});

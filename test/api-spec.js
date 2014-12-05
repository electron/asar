'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');

var asar = require('../lib/asar');

describe('api', function() {
  
  it('should create archive from directory', function(done) {
    asar.createPackage('test/input/packthis/', 'tmp/packthis-api.asar', function (error) {
      var actual = fs.readFileSync('tmp/packthis-api.asar', 'utf8');
      var expected = fs.readFileSync('test/expected/packthis.asar', 'utf8');
      done(assert.equal(actual, expected));
    });
  });

  it('should list files/dirs in archive', function() {
    var actual = asar.listPackage('test/input/extractthis.asar').join('\n');
    var expected = fs.readFileSync('test/expected/extractthis-filelist.txt', 'utf8');
    return assert.equal(actual, expected);
  });

});

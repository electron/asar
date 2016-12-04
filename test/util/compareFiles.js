'use strict';
var assert = require('assert');
var fs = require('fs');

module.exports = function(filepathA, filepathB) {
  var actual = fs.readFileSync(filepathA, 'utf8');
  var expected = fs.readFileSync(filepathB, 'utf8');
  return assert.equal(actual, expected);
};

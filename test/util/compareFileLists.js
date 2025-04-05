'use strict';

const assert = require('node:assert');
const os = require('node:os');

module.exports = function compareFileLists(actual, expected) {
  // on windows replace slashes with backslashes and crlf with lf
  if (os.platform() === 'win32') {
    expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
  }
  assert.strictEqual(actual, expected);
};

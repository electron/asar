import assert from 'node:assert';
import os from 'node:os';

export function compFileLists(actual, expected) {
  // on windows replace slashes with backslashes and crlf with lf
  if (os.platform() === 'win32') {
    expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
  }
  assert.strictEqual(actual, expected);
}

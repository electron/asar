import assert from 'assert';
import os from 'os';

export default function compareFileLists(actual: string, expected: string) {
  // on windows replace slashes with backslashes and crlf with lf
  if (os.platform() === 'win32') {
    expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
  }
  assert.strictEqual(actual, expected);
}

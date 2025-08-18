import { expect } from 'vitest';
import os from 'node:os';

export function compFileLists(actual: string, expected: string): void {
  // on windows replace slashes with backslashes and crlf with lf
  if (os.platform() === 'win32') {
    expected = expected.replace(/\//g, '\\').replace(/\r\n/g, '\n');
  }
  expect(actual).toBe(expected);
}

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ensureWithin } from '../src/path-validation.js';

describe('ensureWithin', () => {
  const container = '/archive.asar.unpacked';

  it('should return resolved path for valid filenames', () => {
    expect(ensureWithin(container, 'file.txt')).toBe(
      path.resolve(container, 'file.txt'),
    );
    expect(ensureWithin(container, 'sub/dir/file.txt')).toBe(
      path.resolve(container, 'sub/dir/file.txt'),
    );
  });

  it('should throw for path traversal with ../', () => {
    expect(() => ensureWithin(container, '../etc/passwd')).toThrow('outside');
    expect(() => ensureWithin(container, '../../etc/passwd')).toThrow('outside');
    expect(() => ensureWithin(container, 'sub/../../etc/passwd')).toThrow('outside');
  });

  it('should allow .. that stays within container', () => {
    expect(ensureWithin(container, 'sub/../file.txt')).toBe(
      path.resolve(container, 'file.txt'),
    );
  });

  it('should throw for absolute paths outside container', () => {
    expect(() => ensureWithin(container, '/etc/passwd')).toThrow('outside');
  });
});

import { describe, it, expect } from 'vitest';
import { validateHeader } from '../src/disk.js';

describe('validateHeader', () => {
  it('should accept a valid header with files', () => {
    expect(() =>
      validateHeader({
        files: {
          'index.js': {
            offset: '0',
            size: 100,
            integrity: {
              algorithm: 'SHA256',
              hash: 'abc123',
              blockSize: 4194304,
              blocks: ['abc123'],
            },
          },
        },
      }),
    ).not.toThrow();
  });

  it('should accept a valid header with nested directories', () => {
    expect(() =>
      validateHeader({
        files: {
          src: {
            files: {
              'main.js': {
                offset: '0',
                size: 50,
              },
            },
          },
        },
      }),
    ).not.toThrow();
  });

  it('should accept a valid header with link entries', () => {
    expect(() =>
      validateHeader({
        files: {
          'link.js': {
            link: 'target.js',
          },
        },
      }),
    ).not.toThrow();
  });

  it('should accept a valid header with unpacked file entries', () => {
    expect(() =>
      validateHeader({
        files: {
          'native.node': {
            unpacked: true,
            size: 1024,
          },
        },
      }),
    ).not.toThrow();
  });

  it('should accept empty directory', () => {
    expect(() => validateHeader({ files: {} })).not.toThrow();
  });

  it('should reject non-object header', () => {
    expect(() => validateHeader('string')).toThrow('header must be an object');
    expect(() => validateHeader(null)).toThrow('header must be an object');
    expect(() => validateHeader([])).toThrow('header must be an object');
    expect(() => validateHeader(42)).toThrow('header must be an object');
  });

  it('should reject header without files property', () => {
    expect(() => validateHeader({})).toThrow('root header must be a directory');
  });

  it('should reject file entry with non-string offset', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: 123,
            size: 100,
          },
        },
      }),
    ).toThrow('"offset" must be a string');
  });

  it('should reject file entry with non-numeric offset string', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: 'abc',
            size: 100,
          },
        },
      }),
    ).toThrow('"offset" must be a numeric string');
  });

  it('should reject file entry with non-number size', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: '100',
          },
        },
      }),
    ).toThrow('"size" must be a non-negative number');
  });

  it('should reject file entry with negative size', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: -1,
          },
        },
      }),
    ).toThrow('"size" must be a non-negative number');
  });

  it('should reject file entry with non-boolean unpacked', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: 100,
            unpacked: 'yes',
          },
        },
      }),
    ).toThrow('"unpacked" must be a boolean');
  });

  it('should reject file entry with non-boolean executable', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: 100,
            executable: 1,
          },
        },
      }),
    ).toThrow('"executable" must be a boolean');
  });

  it('should reject link entry with non-string link', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad-link': {
            link: 123,
          },
        },
      }),
    ).toThrow('"link" must be a string');
  });

  it('should reject link entry with empty link', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad-link': {
            link: '',
          },
        },
      }),
    ).toThrow('"link" must not be empty');
  });

  it('should reject directory entry with non-object files', () => {
    expect(() =>
      validateHeader({
        files: {
          dir: {
            files: 'not-an-object',
          },
        },
      }),
    ).toThrow('"files" must be a plain object');
  });

  it('should reject directory entry with array files', () => {
    expect(() =>
      validateHeader({
        files: {
          dir: {
            files: [],
          },
        },
      }),
    ).toThrow('"files" must be a plain object');
  });

  it('should reject entry names with path separators', () => {
    expect(() =>
      validateHeader({
        files: {
          'a/b': {
            offset: '0',
            size: 100,
          },
        },
      }),
    ).toThrow('invalid entry name');
  });

  it('should reject dot-dot entry names', () => {
    expect(() =>
      validateHeader({
        files: {
          '..': {
            files: {},
          },
        },
      }),
    ).toThrow('invalid entry name');
  });

  it('should reject entries that are not directory, file, or link', () => {
    expect(() =>
      validateHeader({
        files: {
          mystery: {
            something: 'weird',
          },
        },
      }),
    ).toThrow('entry must be a directory');
  });

  it('should reject non-object entries', () => {
    expect(() =>
      validateHeader({
        files: {
          bad: 'string',
        },
      }),
    ).toThrow('entry must be an object');
  });

  it('should reject invalid integrity object', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: 100,
            integrity: 'not-an-object',
          },
        },
      }),
    ).toThrow('"integrity" must be an object');
  });

  it('should reject integrity with non-string hash', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: 100,
            integrity: {
              algorithm: 'SHA256',
              hash: 123,
              blockSize: 4194304,
              blocks: [],
            },
          },
        },
      }),
    ).toThrow('"integrity.hash" must be a string');
  });

  it('should reject integrity with non-array blocks', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: 100,
            integrity: {
              algorithm: 'SHA256',
              hash: 'abc',
              blockSize: 4194304,
              blocks: 'not-an-array',
            },
          },
        },
      }),
    ).toThrow('"integrity.blocks" must be an array');
  });

  it('should reject integrity with non-string block entries', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: 100,
            integrity: {
              algorithm: 'SHA256',
              hash: 'abc',
              blockSize: 4194304,
              blocks: [123],
            },
          },
        },
      }),
    ).toThrow('"integrity.blocks[0]" must be a string');
  });

  it('should reject integrity with invalid blockSize', () => {
    expect(() =>
      validateHeader({
        files: {
          'bad.js': {
            offset: '0',
            size: 100,
            integrity: {
              algorithm: 'SHA256',
              hash: 'abc',
              blockSize: 0,
              blocks: [],
            },
          },
        },
      }),
    ).toThrow('"integrity.blockSize" must be a positive number');
  });

  it('should include the entry path in error messages', () => {
    expect(() =>
      validateHeader({
        files: {
          src: {
            files: {
              'bad.js': {
                offset: 999,
                size: 100,
              },
            },
          },
        },
      }),
    ).toThrow('/src/bad.js');
  });

  it('should validate existing asar headers succeed', async () => {
    // readArchiveHeaderSync calls validateHeader internally,
    // so valid archives should parse without errors
    const { readArchiveHeaderSync } = await import('../src/disk.js');
    expect(() => readArchiveHeaderSync('test/expected/packthis.asar')).not.toThrow();
  });
});

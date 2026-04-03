import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import { Pickle } from '../src/pickle.js';
import { readArchiveHeaderSync, uncacheAll } from '../src/disk.js';
import { extractFile } from '../src/asar.js';
import { TEST_APPS_DIR } from './util/constants.js';

/**
 * Helper to build a minimal asar archive binary from a header object
 * and optional file content buffer.
 */
function buildAsar(header: object, fileContent?: Buffer): Buffer {
  const headerString = JSON.stringify(header);
  const headerPickle = Pickle.createEmpty();
  headerPickle.writeString(headerString);
  const headerBuf = headerPickle.toBuffer();

  const sizePickle = Pickle.createEmpty();
  sizePickle.writeUInt32(headerBuf.length);
  const sizeBuf = sizePickle.toBuffer();

  const parts = [sizeBuf, headerBuf];
  if (fileContent) {
    parts.push(fileContent);
  }
  return Buffer.concat(parts);
}

/**
 * Helper to build a raw asar binary with an arbitrary size field
 * in the size pickle (to simulate a malicious header size).
 */
function buildAsarWithRawHeaderSize(claimedHeaderSize: number): Buffer {
  const sizePickle = Pickle.createEmpty();
  sizePickle.writeUInt32(claimedHeaderSize);
  const sizeBuf = sizePickle.toBuffer();
  // Only write the size prefix — no actual header data follows
  return sizeBuf;
}

describe('DoS validation', () => {
  const tmpDir = path.join(TEST_APPS_DIR, 'dos-validation');

  beforeAll(() => {
    fs.mkdirpSync(tmpDir);
  });

  afterAll(() => {
    uncacheAll();
  });

  describe('readArchiveHeaderSync - header size validation', () => {
    it('should reject header size larger than the archive file', () => {
      // Create an asar file that claims a 1GB header but is only a few bytes
      const malicious = buildAsarWithRawHeaderSize(1_000_000_000);
      const archivePath = path.join(tmpDir, 'oversized-header.asar');
      fs.writeFileSync(archivePath, malicious);

      expect(() => readArchiveHeaderSync(archivePath)).toThrowError(
        /Header size .* exceeds archive size .* The archive is corrupted/,
      );
    });

    it('should reject header size equal to archive size (no room for 8-byte prefix)', () => {
      // Write a valid size pickle + a tiny amount of data, but claim the header
      // is as large as the entire file
      const sizePickle = Pickle.createEmpty();
      // The size pickle itself is 8 bytes, so claim headerSize = 8
      // which means header would need bytes [8..16] but file is only 8 bytes
      sizePickle.writeUInt32(8);
      const sizeBuf = sizePickle.toBuffer();
      const archivePath = path.join(tmpDir, 'header-equals-filesize.asar');
      fs.writeFileSync(archivePath, sizeBuf);

      expect(() => readArchiveHeaderSync(archivePath)).toThrowError(
        /Header size .* exceeds archive size .* The archive is corrupted/,
      );
    });

    it('should accept a valid archive with correct header size', () => {
      const fileContent = Buffer.from('hello world');
      const header = {
        files: {
          'test.txt': {
            offset: '0',
            size: fileContent.length,
          },
        },
      };
      const asar = buildAsar(header, fileContent);
      const archivePath = path.join(tmpDir, 'valid.asar');
      fs.writeFileSync(archivePath, asar);

      const result = readArchiveHeaderSync(archivePath);
      expect(result.header.files).toHaveProperty('test.txt');
    });
  });

  describe('readFileSync / extractFile - file size validation', () => {
    it('should reject a file entry whose size exceeds the archive', () => {
      const fileContent = Buffer.from('small');
      const header = {
        files: {
          'evil.txt': {
            offset: '0',
            size: 999_999_999, // claims ~1GB but only 5 bytes exist
          },
        },
      };
      const asar = buildAsar(header, fileContent);
      const archivePath = path.join(tmpDir, 'oversized-file.asar');
      fs.writeFileSync(archivePath, asar);

      uncacheAll();
      expect(() => extractFile(archivePath, 'evil.txt')).toThrowError(
        /extends beyond archive boundary/,
      );
    });

    it('should reject a file entry whose offset places it beyond the archive', () => {
      const fileContent = Buffer.from('small');
      const header = {
        files: {
          'evil.txt': {
            offset: '999999999', // offset way past end of file
            size: 5,
          },
        },
      };
      const asar = buildAsar(header, fileContent);
      const archivePath = path.join(tmpDir, 'bad-offset-file.asar');
      fs.writeFileSync(archivePath, asar);

      uncacheAll();
      expect(() => extractFile(archivePath, 'evil.txt')).toThrowError(
        /extends beyond archive boundary/,
      );
    });

    it('should extract a valid file without error', () => {
      const fileContent = Buffer.from('hello world');
      const header = {
        files: {
          'test.txt': {
            offset: '0',
            size: fileContent.length,
          },
        },
      };
      const asar = buildAsar(header, fileContent);
      const archivePath = path.join(tmpDir, 'valid-extract.asar');
      fs.writeFileSync(archivePath, asar);

      uncacheAll();
      const extracted = extractFile(archivePath, 'test.txt');
      expect(extracted.toString('utf8')).toBe('hello world');
    });

    it('should return empty buffer for zero-size files', () => {
      const header = {
        files: {
          'empty.txt': {
            offset: '0',
            size: 0,
          },
        },
      };
      const asar = buildAsar(header);
      const archivePath = path.join(tmpDir, 'zero-size.asar');
      fs.writeFileSync(archivePath, asar);

      uncacheAll();
      const extracted = extractFile(archivePath, 'empty.txt');
      expect(extracted.length).toBe(0);
    });
  });
});

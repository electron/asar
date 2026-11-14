import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import { createPackageFromStreams, extractFile, uncacheAll } from '../src/asar.js';
import { Filesystem } from '../src/filesystem.js';
import { InputMetadata, writeFilesystem } from '../src/disk.js';
import { useTmpDir } from './util/tmpDir.js';

describe('packing file sizes', () => {
  const { testRunDir, createFixture } = useTmpDir(uncacheAll);
  afterEach(() => vi.restoreAllMocks());

  it.each(['large', 'stale-small', 'transformed'] as const)(
    'rejects changed %s disk contents at write time',
    async (kind) => {
      const original =
        kind === 'large' ? Buffer.alloc(2 * 1024 * 1024 + 1) : Buffer.from('original');
      const src = createFixture(kind, { 'file.txt': original });
      const filename = path.join(src, 'file.txt');
      const metadata: InputMetadata = { [filename]: { type: 'file', stat: fs.statSync(filename) } };
      const filesystem = new Filesystem(src);
      if (kind === 'stale-small') fs.writeFileSync(filename, 'short');
      await filesystem.insertFile(
        filename,
        () => fs.createReadStream(filename),
        false,
        metadata[filename],
        {
          transform:
            kind === 'transformed'
              ? () =>
                  new Transform({
                    transform(_chunk, _encoding, callback) {
                      callback(null, Buffer.from('transformed content'));
                    },
                  })
              : undefined,
        },
      );
      const transformed = metadata[filename].transformed;
      const expectedSize = transformed ? transformed.stat.size : original.length;
      fs.writeFileSync(transformed ? transformed.path : filename, 'changed');
      try {
        await expect(
          writeFilesystem(
            path.join(testRunDir, `${kind}.asar`),
            filesystem,
            {
              files: [{ filename, unpack: false }],
              links: [],
            },
            metadata,
          ),
        ).rejects.toThrow(
          `file size changed while packing (expected ${expectedSize} bytes, got 7)`,
        );
      } finally {
        if (transformed)
          fs.rmSync(path.dirname(transformed.path), { recursive: true, force: true });
      }
    },
  );

  it('preserves cached contents when the source changes after hashing', async () => {
    const src = createFixture('cached', { 'file.txt': 'cached' });
    const filename = path.join(src, 'file.txt');
    const metadata: InputMetadata = { [filename]: { type: 'file', stat: fs.statSync(filename) } };
    const filesystem = new Filesystem(src);
    await filesystem.insertFile(
      filename,
      () => fs.createReadStream(filename),
      false,
      metadata[filename],
    );
    fs.writeFileSync(filename, 'changed source');
    const dest = path.join(testRunDir, 'cached.asar');
    await writeFilesystem(
      dest,
      filesystem,
      { files: [{ filename, unpack: false }], links: [] },
      metadata,
    );
    expect(extractFile(dest, 'file.txt').toString()).toBe('cached');
  });

  it('preserves empty files, multibyte strings and following stream offsets', async () => {
    const src = createFixture('matching', { empty: '', unicode: '中文', last: 'last' });
    const dest = path.join(testRunDir, 'matching.asar');
    const contents = { empty: '', unicode: '中文', last: 'last' };
    await createPackageFromStreams(
      dest,
      Object.entries(contents).map(([filename, content]) => ({
        path: filename,
        type: 'file',
        unpacked: false,
        stat: fs.statSync(path.join(src, filename)),
        streamGenerator: () => Readable.from([content]),
      })),
    );
    for (const [filename, content] of Object.entries(contents)) {
      expect(extractFile(dest, filename).toString()).toBe(content);
    }
  });

  it('keeps shared output listeners bounded when packing many files', async () => {
    const src = createFixture('many-files', { file: 'content00' });
    const dest = path.join(testRunDir, 'many-files.asar');
    const createWriteStream = fs.createWriteStream;
    const outputs: ReturnType<typeof fs.createWriteStream>[] = [];
    const listenerCounts: number[] = [];
    vi.spyOn(fs, 'createWriteStream').mockImplementation((...args) => {
      const output = createWriteStream(...args);
      outputs.push(output);
      return output;
    });
    await createPackageFromStreams(
      dest,
      Array.from({ length: 30 }, (_, index) => ({
        path: `file-${index}`,
        type: 'file' as const,
        unpacked: false,
        stat: fs.statSync(path.join(src, 'file')),
        streamGenerator: () => {
          const output = outputs[0];
          if (output) {
            listenerCounts.push(
              output.eventNames().reduce((count, event) => count + output.listenerCount(event), 0),
            );
          }
          return Readable.from([`content${String(index).padStart(2, '0')}`]);
        },
      })),
    );
    expect(listenerCounts).toHaveLength(30);
    expect(Math.max(...listenerCounts)).toBeLessThanOrEqual(listenerCounts[0] + 2);
    for (let index = 0; index < 30; index++) {
      expect(extractFile(dest, `file-${index}`).toString()).toBe(
        `content${String(index).padStart(2, '0')}`,
      );
    }
  });

  it('propagates read errors and closes the archive output', async () => {
    const src = createFixture('read-error', { 'file.txt': 'original' });
    const createWriteStream = fs.createWriteStream;
    const outputs: ReturnType<typeof fs.createWriteStream>[] = [];
    vi.spyOn(fs, 'createWriteStream').mockImplementation((...args) => {
      const output = createWriteStream(...args);
      outputs.push(output);
      return output;
    });
    const error = new Error('source failed');
    let reads = 0;
    await expect(
      createPackageFromStreams(path.join(testRunDir, 'read-error.asar'), [
        {
          path: 'file.txt',
          type: 'file',
          unpacked: false,
          stat: fs.statSync(path.join(src, 'file.txt')),
          streamGenerator: () =>
            reads++ === 0
              ? Readable.from([Buffer.from('original')])
              : new Readable({
                  read() {
                    this.destroy(error);
                  },
                }),
        },
      ]),
    ).rejects.toBe(error);
    const output = outputs[0];
    expect(output.closed).toBe(true);
  });

  it('rejects a delayed destination write error after the source ends', async () => {
    const src = createFixture('write-error', { file: 'original' });
    const error = new Error('destination failed');
    const createWriteStream = fs.createWriteStream;
    const outputs: ReturnType<typeof fs.createWriteStream>[] = [];
    let sourceEnded = false;
    let endedBeforeError = false;
    vi.spyOn(fs, 'createWriteStream').mockImplementation((...args) => {
      const output = createWriteStream(...args);
      const write = output._write.bind(output);
      vi.spyOn(output, '_write').mockImplementation((chunk, encoding, callback) => {
        if (chunk.toString() === 'original') {
          setTimeout(() => {
            endedBeforeError = sourceEnded;
            callback(error);
          }, 10);
        } else {
          write(chunk, encoding, callback);
        }
      });
      outputs.push(output);
      return output;
    });
    let reads = 0;
    await expect(
      createPackageFromStreams(path.join(testRunDir, 'write-error.asar'), [
        {
          path: 'file',
          type: 'file',
          unpacked: false,
          stat: fs.statSync(path.join(src, 'file')),
          streamGenerator: () => {
            const input = Readable.from(['original']);
            if (reads++ > 0) input.once('end', () => (sourceEnded = true));
            return input;
          },
        },
      ]),
    ).rejects.toBe(error);
    expect(endedBeforeError).toBe(true);
    expect(outputs[0].closed).toBe(true);
  });

  it.each(['', 'longer content'])(
    'rejects a stream that changes to %j after hashing',
    async (content) => {
      const src = createFixture(`stream-${content.length}`, { 'file.txt': 'original' });
      let reads = 0;
      await expect(
        createPackageFromStreams(path.join(testRunDir, `stream-${content.length}.asar`), [
          {
            path: 'file.txt',
            type: 'file',
            unpacked: false,
            stat: fs.statSync(path.join(src, 'file.txt')),
            streamGenerator: () =>
              Readable.from([Buffer.from(reads++ === 0 ? 'original' : content)]),
          },
        ]),
      ).rejects.toThrow(
        `file.txt: file size changed while packing (expected 8 bytes, got ${Buffer.byteLength(content)})`,
      );
    },
  );
});

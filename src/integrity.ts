import crypto from 'node:crypto';
import stream from 'node:stream';
import streamPromises from 'node:stream/promises';

const ALGORITHM = 'SHA256';
// 4MB default block size
const BLOCK_SIZE = 4 * 1024 * 1024;

export type FileIntegrity = {
  algorithm: 'SHA256';
  hash: string;
  blockSize: number;
  blocks: string[];
};

export async function getFileIntegrity(
  inputFileStream: NodeJS.ReadableStream,
): Promise<FileIntegrity> {
  const fileHash = crypto.createHash(ALGORITHM);

  const blockHashes: string[] = [];
  let blockHash = crypto.createHash(ALGORITHM);
  let currentBlockSize = 0;

  await streamPromises.pipeline(
    inputFileStream,
    new stream.PassThrough({
      decodeStrings: false,
      transform(_chunk: Buffer, encoding, callback) {
        fileHash.update(_chunk);

        let offset = 0;
        while (offset < _chunk.byteLength) {
          const remaining = BLOCK_SIZE - currentBlockSize;
          const end = Math.min(offset + remaining, _chunk.byteLength);
          const slice =
            offset === 0 && end === _chunk.byteLength ? _chunk : _chunk.subarray(offset, end);
          blockHash.update(slice);
          currentBlockSize += end - offset;
          if (currentBlockSize === BLOCK_SIZE) {
            blockHashes.push(blockHash.digest('hex'));
            blockHash = crypto.createHash(ALGORITHM);
            currentBlockSize = 0;
          }
          offset = end;
        }
        callback();
      },
      flush(callback) {
        if (currentBlockSize > 0 || blockHashes.length === 0) {
          blockHashes.push(blockHash.digest('hex'));
        }
        callback();
      },
    }),
  );

  return {
    algorithm: ALGORITHM,
    hash: fileHash.digest('hex'),
    blockSize: BLOCK_SIZE,
    blocks: blockHashes,
  };
}

export function getFileIntegrityFromBuffer(data: Buffer): FileIntegrity {
  const hash = crypto.createHash(ALGORITHM).update(data).digest('hex');
  const blocks: string[] = [];
  for (let offset = 0; offset < data.length; offset += BLOCK_SIZE) {
    const end = Math.min(offset + BLOCK_SIZE, data.length);
    blocks.push(crypto.createHash(ALGORITHM).update(data.subarray(offset, end)).digest('hex'));
  }
  if (data.length === 0) {
    blocks.push(crypto.createHash(ALGORITHM).update(data).digest('hex'));
  }
  return { algorithm: ALGORITHM, hash, blockSize: BLOCK_SIZE, blocks };
}

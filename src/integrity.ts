import * as crypto from 'crypto';
import * as fs from 'fs';
import * as stream from 'stream';
import { promisify } from 'util';

const ALGORITHM = 'SHA256';
// 4MB default block size
const BLOCK_SIZE = 4 * 1024 * 1024;

const pipeline = promisify(stream.pipeline);

function hashBlock(block: Buffer) {
  return crypto.createHash(ALGORITHM).update(block).digest('hex');
}

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
  let currentBlockSize = 0;
  let currentBlock: Buffer[] = [];

  await pipeline(
    inputFileStream,
    new stream.PassThrough({
      decodeStrings: false,
      transform(_chunk: Buffer, encoding, callback) {
        fileHash.update(_chunk);

        function handleChunk(chunk: Buffer) {
          const diffToSlice = Math.min(BLOCK_SIZE - currentBlockSize, chunk.byteLength);
          currentBlockSize += diffToSlice;
          currentBlock.push(chunk.slice(0, diffToSlice));
          if (currentBlockSize === BLOCK_SIZE) {
            blockHashes.push(hashBlock(Buffer.concat(currentBlock)));
            currentBlock = [];
            currentBlockSize = 0;
          }
          if (diffToSlice < chunk.byteLength) {
            handleChunk(chunk.slice(diffToSlice));
          }
        }
        handleChunk(_chunk);
        callback();
      },
      flush(callback) {
        blockHashes.push(hashBlock(Buffer.concat(currentBlock)));
        currentBlock = [];
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

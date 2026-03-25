import crypto from 'node:crypto';
import stream from 'node:stream';
import streamPromises from 'node:stream/promises';
import { FileRecord, getRawHeader } from './asar.js';

const ALGORITHM = 'SHA256';
// 4MB default block size
const BLOCK_SIZE = 4 * 1024 * 1024;

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

  await streamPromises.pipeline(
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
        if (currentBlockSize > 0 || blockHashes.length === 0) {
          blockHashes.push(hashBlock(Buffer.concat(currentBlock)));
          currentBlock = [];
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

export type ArchiveIntegrity = Pick<FileRecord['integrity'], 'algorithm' | 'hash'>;

export function getArchiveIntegrity(archivePath: string): ArchiveIntegrity {
  const { headerString } = getRawHeader(archivePath);
  return {
    algorithm: 'SHA256',
    hash: crypto.createHash('SHA256').update(headerString).digest('hex'),
  };
}

// To be inserted into Info.plist of the app.
export type AsarIntegrityInfoMacOS = Record<string, ArchiveIntegrity>;

// To be added as a resource to the app.
export type AsarIntegrityInfoWindows = { resourceType: 'Integrity', resourceName: 'ElectronAsar', resourceData: Buffer };
export type AsarIntegrityInfoWindowsFiles = {file: string, alg: string, value: string}[];

type ASARIntegrityPlatformInfoMap = {
  macos: AsarIntegrityInfoMacOS;
  windows: AsarIntegrityInfoWindows;
};

export function getAsarIntegrityInfo(
  files: { relativePath: string; fullPath: string }[],
  platform: 'macos',
): AsarIntegrityInfoMacOS;
export function getAsarIntegrityInfo(
  files: { relativePath: string; fullPath: string }[],
  platform: 'windows',
): AsarIntegrityInfoWindows;
export function getAsarIntegrityInfo(
  files: { relativePath: string; fullPath: string }[],
  platform: keyof ASARIntegrityPlatformInfoMap,
) {
  switch (platform) {
    case 'macos':
      return Object.fromEntries(
        files.map((file) => [file.relativePath, getArchiveIntegrity(file.fullPath)]),
      );
    case 'windows': {
        const filesJson: AsarIntegrityInfoWindowsFiles = files.map((file) => ({
          file: file.relativePath,
          alg: 'SHA256',
          value: getArchiveIntegrity(file.fullPath).hash,
        }));
        return {
          resourceType: 'Integrity',
          resourceName: 'ElectronAsar',
          resourceData: Buffer.from(JSON.stringify(filesJson), 'utf-8'),
        } as AsarIntegrityInfoWindows;
      }
    default:
      throw new Error(`Invalid platform: ${platform}`);
  }
}

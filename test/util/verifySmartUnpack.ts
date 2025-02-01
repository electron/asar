import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { expect } from 'vitest';
import { readFilesystemSync } from '../../src/disk';
import { Filesystem } from '../../src/filesystem';
import walk from './walk';

export function toSystemIndependentPath(s: string) {
  return path.sep === '/' ? s : s.replace(/\\/g, '/');
}

export function removeUnstableProperties(data: any) {
  return JSON.parse(
    JSON.stringify(data, (name, value) => {
      if (name === 'offset') {
        return undefined;
      }
      return value;
    }),
  );
}

export async function verifySmartUnpack(
  asarPath: string,
  additionalVerifications?: (asarFilesystem: Filesystem) => Promise<void>,
) {
  const asarFs = readFilesystemSync(asarPath);

  // for verifying additional files within the Asar Filesystem
  await additionalVerifications?.(asarFs);

  // verify header
  expect(removeUnstableProperties(asarFs.getHeader())).toMatchSnapshot();

  const unpackedDirPath = `${asarPath}.unpacked`;
  if (!existsSync(unpackedDirPath)) {
    return;
  }
  const files = (await walk(unpackedDirPath)).map((it: string) => {
    const name = toSystemIndependentPath(it.substring(unpackedDirPath.length + 1));
    if (it.endsWith('.txt') || it.endsWith('.json')) {
      return { name, content: readFileSync(it, 'utf-8') };
    }
    return name;
  });
  expect(files).toMatchSnapshot();
}

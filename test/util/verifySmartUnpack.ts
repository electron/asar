import { readArchiveHeaderSync } from '../../src/disk';
import fs from '../../src/wrapped-fs';
import * as path from 'path';
import walk from './walk';

const rootDir = path.resolve(__dirname, '..', '..');

export const verifySmartUnpack = async (asarPath: string) => {
  asarPath = path.isAbsolute(asarPath) ? asarPath : path.join(rootDir, asarPath);
  // verify header
  const asarFs = readArchiveHeaderSync(asarPath);
  expect(removeUnstableProperties(asarFs.header)).toMatchSnapshot();

  // check unpacked dir
  const unpackedDir = `${asarPath}.unpacked`;
  if (fs.existsSync(unpackedDir)) {
    await verifyFileTree(unpackedDir);
  }
};

export const verifyFileTree = async (dirPath: string) => {
  const dirFiles = walk(dirPath);
  const files = dirFiles.map((it) => {
    const name = toSystemIndependentPath(path.relative(dirPath, it));
    if (it.endsWith('.txt') || it.endsWith('.json')) {
      return { name, content: fs.readFileSync(it, 'utf-8') };
    }
    return name;
  });
  expect(files).toMatchSnapshot();
};

export function toSystemIndependentPath(s: string): string {
  return path.sep === '/' ? s : s.replace(/\\/g, '/');
}

export function removeUnstableProperties(data: any) {
  return JSON.parse(
    JSON.stringify(data, (name, value) => {
      if (name === 'offset') {
        return undefined;
      }
      if (name === 'link') {
        return toSystemIndependentPath(value);
      }
      return value;
    }),
  );
}

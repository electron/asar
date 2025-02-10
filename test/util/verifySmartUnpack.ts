import { readArchiveHeaderSync } from '../../src/disk';
import fs from '../../src/wrapped-fs';
import * as path from 'path';
import walk from './walk';
import { ROOT_PROJECT_DIR } from './constants';

export const verifySmartUnpack = async (asarPath: string) => {
  asarPath = path.isAbsolute(asarPath) ? asarPath : path.join(ROOT_PROJECT_DIR, asarPath);
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

export const toSystemIndependentPath = (s: string): string => {
  return path.sep === '/' ? s : s.replace(/\\/g, '/');
};

export const removeUnstableProperties = (data: any) => {
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
};

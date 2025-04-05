import { readFilesystemSync } from '../../lib/disk.js';
import { wrappedFs as fs } from '../../lib/wrapped-fs.js';
import path from 'node:path';
import { walk } from './walk.js';
import { ROOT_PROJECT_DIR } from './constants.js';

import { expect } from 'chai';

export const verifySmartUnpack = async (asarPath) => {
  asarPath = path.isAbsolute(asarPath) ? asarPath : path.join(ROOT_PROJECT_DIR, asarPath);
  // verify header
  const asarFs = readFilesystemSync(asarPath);
  expect(removeUnstableProperties(asarFs.getHeader())).toMatchSnapshot();

  // check unpacked dir
  const unpackedDir = `${asarPath}.unpacked`;
  if (fs.existsSync(unpackedDir)) {
    await verifyFileTree(unpackedDir);
  }
};

export const verifyFileTree = async (dirPath) => {
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

const removeUnstableProperties = (data) => {
  return JSON.parse(
    JSON.stringify(data, (name, value) => {
      if (name === 'link') {
        return toSystemIndependentPath(value);
      }
      return value;
    }),
  );
};

const toSystemIndependentPath = (filepath) => {
  return path.sep === '/' ? filepath : filepath.replace(/\\/g, '/');
};

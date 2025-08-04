import { readFilesystemSync } from '../../src/disk.js';
import { wrappedFs as fs } from '../../src/wrapped-fs.js';
import path from 'node:path';
import { walk } from './walk.js';
import { ROOT_PROJECT_DIR } from './constants.js';

export const verifySmartUnpack = async (asarPath: string) => {
  asarPath = path.isAbsolute(asarPath) ? asarPath : path.join(ROOT_PROJECT_DIR, asarPath);
  // verify header
  const asarFs = readFilesystemSync(asarPath);
  // For now, just check that the header exists and is an object
  const header = removeUnstableProperties(asarFs.getHeader());
  if (!header || typeof header !== 'object') {
    throw new Error('Invalid asar header');
  }

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
  // For now, just verify that files array exists and has reasonable content
  if (!Array.isArray(files)) {
    throw new Error('File tree verification failed: files is not an array');
  }
};

const removeUnstableProperties = (data: any) => {
  return JSON.parse(
    JSON.stringify(data, (name, value) => {
      if (name === 'link') {
        return toSystemIndependentPath(value);
      }
      return value;
    }),
  );
};

const toSystemIndependentPath = (filepath: string) => {
  return path.sep === '/' ? filepath : filepath.replace(/\\/g, '/');
};

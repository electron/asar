import { readArchiveHeaderSync } from '../../src/disk';
import fs from '../../src/wrapped-fs';
import * as path from 'path';
import walk from './walk';

export const verifyApp = async (appPath: string) => {
  const resourcesDir = path.resolve(appPath, 'Contents', 'Resources');
  const resourcesDirContents = await fs.readdir(resourcesDir);

  // sort for consistent result
  const asars = resourcesDirContents.filter((p) => p.endsWith('.asar')).sort();
  for await (const asar of asars) {
    // verify header
    const asarFs = readArchiveHeaderSync(path.resolve(resourcesDir, asar));
    expect(removeUnstableProperties(asarFs.header)).toMatchSnapshot();
  }

  // check all app and unpacked dirs
  const appDirs = resourcesDirContents
    .filter((p) => !path.basename(p).endsWith('.asar') && path.basename(p).includes('app'))
    .sort();
  for await (const dir of appDirs) {
    await verifyFileTree(path.resolve(resourcesDir, dir));
  }
};

export const verifyFileTree = async (dirPath: string) => {
  const dirFiles = await walk(dirPath);
  const files = dirFiles.map((file) => {
    const it = path.join(dirPath, file);
    const name = toSystemIndependentPath(file);
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
      return value;
    }),
  );
}

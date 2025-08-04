import { wrappedFs as fs } from '../../lib/wrapped-fs.js';
import path from 'node:path';
import { crawl as crawlFilesystem } from '../../lib/crawlfs.js';

export async function compDirs(dirA: string, dirB: string): Promise<void> {
  const [[pathsA, metadataA], [pathsB, metadataB]] = await Promise.all([
    crawlFilesystem(dirA, {}),
    crawlFilesystem(dirB, {}),
  ]);
  const relativeA = new Set(pathsA.map((pathAItem) => path.relative(dirA, pathAItem)));
  const relativeB = new Set(pathsB.map((pathBItem) => path.relative(dirB, pathBItem)));
  const onlyInA = relativeA.difference(relativeB);
  const onlyInB = relativeB.difference(relativeA);
  const inBoth = new Set(pathsA).intersection(new Set(pathsB));
  const differentFiles: string[] = [];
  const errorMsgBuilder: string[] = [];

  for (const filename of inBoth) {
    const typeA = metadataA[filename].type;
    const typeB = metadataB[filename].type;
    // skip if both are directories
    if (typeA === 'directory' && typeB === 'directory') {
      continue;
    }
    // something is wrong if the types don't match up
    if (typeA !== typeB) {
      differentFiles.push(filename);
      continue;
    }
    const [fileContentA, fileContentB] = await Promise.all(
      [dirA, dirB].map((dir) => fs.readFile(path.join(dir, filename), 'utf8')),
    );
    if (fileContentA !== fileContentB) {
      differentFiles.push(filename);
    }
  }

  if (onlyInA.size) {
    errorMsgBuilder.push(`\tEntries only in '${dirA}':`);
    for (const file of onlyInA) {
      errorMsgBuilder.push(`\t  ${file}`);
    }
  }
  if (onlyInB.size) {
    errorMsgBuilder.push(`\tEntries only in '${dirB}':`);
    for (const file of onlyInB) {
      errorMsgBuilder.push(`\t  ${file}`);
    }
  }
  if (differentFiles.length) {
    errorMsgBuilder.push('\tDifferent file content:');
    for (const file of differentFiles) {
      errorMsgBuilder.push(`\t  ${file}`);
    }
  }
  if (errorMsgBuilder.length) {
    throw new Error('\n' + errorMsgBuilder.join('\n'));
  }
}

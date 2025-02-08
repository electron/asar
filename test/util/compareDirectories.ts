import _ from 'lodash';
import fs from '../../lib/wrapped-fs';
import path from 'path';
import { crawl as crawlFilesystem } from '../../lib/crawlfs';

export default async function (dirA: string, dirB: string) {
  const [[pathsA, metadataA], [pathsB, metadataB]] = await Promise.all([
    crawlFilesystem(dirA, {}),
    crawlFilesystem(dirB, {}),
  ]);
  const relativeA = _.map(pathsA, (pathAItem: string) => path.relative(dirA, pathAItem));
  const relativeB = _.map(pathsB, (pathBItem: string) => path.relative(dirB, pathBItem));
  const onlyInA = _.difference(relativeA, relativeB);
  const onlyInB = _.difference(relativeB, relativeA);
  const inBoth = _.intersection(pathsA, pathsB);
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
  if (onlyInA.length) {
    errorMsgBuilder.push(`\tEntries only in '${dirA}':`);
    for (const file of onlyInA) {
      errorMsgBuilder.push(`\t  ${file}`);
    }
  }
  if (onlyInB.length) {
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

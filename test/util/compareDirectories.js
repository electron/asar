'use strict';

const _ = require('lodash');
const fs = require('../../lib/wrapped-fs').default;
const path = require('path');
const crawlFilesystem = require('../../lib/crawlfs').crawl;

module.exports = async function (dirA, dirB) {
  const [[pathsA, metadataA], [pathsB, metadataB]] = await Promise.all([
    crawlFilesystem(dirA, null),
    crawlFilesystem(dirB, null),
  ]);
  const relativeA = _.map(pathsA, (pathAItem) => path.relative(dirA, pathAItem));
  const relativeB = _.map(pathsB, (pathBItem) => path.relative(dirB, pathBItem));
  const onlyInA = _.difference(relativeA, relativeB);
  const onlyInB = _.difference(relativeB, relativeA);
  const inBoth = _.intersection(pathsA, pathsB);
  const differentFiles = [];
  const errorMsgBuilder = [];
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
    // TODO: FIXME - This promise needs an `await`, but the fixtures are flaky across OS's and it should be investigated separately
    const [fileContentA, fileContentB] = Promise.all(
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
};

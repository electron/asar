'use strict';

const assert = require('assert');
const fs = require('../../lib/wrapped-fs').default;

module.exports = async function (actualFilePath, expectedFilePath) {
  if (process.env.ELECTRON_ASAR_SPEC_UPDATE) {
    await fs.writeFile(expectedFilePath, await fs.readFile(actualFilePath));
  }
  const [actualFileContent, expectedFileContent] = await Promise.all([
    fs.readFile(actualFilePath, 'utf8'),
    fs.readFile(expectedFilePath, 'utf8'),
  ]);
  assert.strictEqual(actualFileContent, expectedFileContent);

  const [actualIsSymlink, expectedIsSymlink] = [
    isSymbolicLinkSync(actualFilePath),
    isSymbolicLinkSync(expectedFilePath),
  ];
  assert.strictEqual(actualIsSymlink, expectedIsSymlink);

  if (actualIsSymlink && expectedIsSymlink) {
    const [actualSymlinkPointer, expectedSymlinkPointer] = [
      fs.readlinkSync(actualFilePath),
      fs.readlinkSync(expectedFilePath),
    ];
    assert.strictEqual(actualSymlinkPointer, expectedSymlinkPointer);
  }
};

function isSymbolicLinkSync(path) {
  const stats = fs.lstatSync(path);
  return stats.isSymbolicLink();
}

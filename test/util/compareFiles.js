import assert from 'node:assert';
import { wrappedFs as fs } from '../../lib/wrapped-fs.js';

export async function compFiles(actualFilePath, expectedFilePath) {
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
}

export function isSymbolicLinkSync(path) {
  const stats = fs.lstatSync(path);
  return stats.isSymbolicLink();
}

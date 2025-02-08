import assert from 'assert';
import fs from '../../lib/wrapped-fs';

async function compFiles(actualFilePath: string, expectedFilePath: string) {
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

function isSymbolicLinkSync(path: string) {
  const stats = fs.lstatSync(path);
  return stats.isSymbolicLink();
}

export { compFiles, isSymbolicLinkSync };

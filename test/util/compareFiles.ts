import { expect } from 'vitest';
import { wrappedFs as fs } from '../../lib/wrapped-fs.js';

export async function compFiles(actualFilePath: string, expectedFilePath: string): Promise<void> {
  if (process.env.ELECTRON_ASAR_SPEC_UPDATE) {
    await fs.writeFile(expectedFilePath, await fs.readFile(actualFilePath));
  }
  const [actualFileContent, expectedFileContent] = await Promise.all([
    fs.readFile(actualFilePath, 'utf8'),
    fs.readFile(expectedFilePath, 'utf8'),
  ]);
  expect(actualFileContent).toBe(expectedFileContent);

  const [actualIsSymlink, expectedIsSymlink] = [
    isSymbolicLinkSync(actualFilePath),
    isSymbolicLinkSync(expectedFilePath),
  ];
  expect(actualIsSymlink).toBe(expectedIsSymlink);

  if (actualIsSymlink && expectedIsSymlink) {
    const [actualSymlinkPointer, expectedSymlinkPointer] = [
      fs.readlinkSync(actualFilePath),
      fs.readlinkSync(expectedFilePath),
    ];
    expect(actualSymlinkPointer).toBe(expectedSymlinkPointer);
  }
}

export function isSymbolicLinkSync(path: string): boolean {
  const stats = fs.lstatSync(path);
  return stats.isSymbolicLink();
}

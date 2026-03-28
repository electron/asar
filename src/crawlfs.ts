import { glob, GlobOptionsWithFileTypesFalse } from 'glob';

import { wrappedFs as fs } from './wrapped-fs.js';
import { Stats } from 'node:fs';
import path from 'node:path';

export type CrawledFileType = {
  type: 'file' | 'directory' | 'link';
  stat: Pick<Stats, 'mode' | 'size'>;
  transformed?: {
    path: string;
    stat: Stats;
  };
  cachedBuffer?: Buffer;
};

export async function determineFileType(filename: string): Promise<CrawledFileType | null> {
  const stat = await fs.lstat(filename);
  if (stat.isFile()) {
    return { type: 'file', stat };
  } else if (stat.isDirectory()) {
    return { type: 'directory', stat };
  } else if (stat.isSymbolicLink()) {
    return { type: 'link', stat };
  }
  return null;
}

export async function crawl(dir: string, options: GlobOptionsWithFileTypesFalse) {
  const metadata: Record<string, CrawledFileType> = {};
  // TODO replace with `fs.glob`
  const crawled = await glob(dir, {
    windowsPathsNoEscape: true,
    ...options,
  });
  const results = await Promise.all(
    crawled.sort().map(async (filename) => [filename, await determineFileType(filename)] as const),
  );
  const links: string[] = [];
  const linkSet = new Set<string>();
  const filenames = results
    .map(([filename, type]) => {
      if (type) {
        metadata[filename] = type;
        if (type.type === 'link') {
          links.push(filename);
          linkSet.add(filename);
        }
      }
      return filename;
    })
    .filter((filename) => {
      if (links.length === 0) return true;
      // Newer glob can return files inside symlinked directories, to avoid
      // those appearing in archives we need to manually exclude them here
      const isExactLink = linkSet.has(filename);
      for (const link of links) {
        if (isExactLink && filename === link) continue;
        if (filename.startsWith(link)) {
          // symlink may point outside the directory: https://github.com/electron/asar/issues/303
          const relativePath = path.relative(link, path.dirname(filename));
          if (!relativePath.startsWith('..')) return false;
        }
      }
      return true;
    });
  return [filenames, metadata] as const;
}

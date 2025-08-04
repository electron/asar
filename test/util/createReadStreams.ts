import { determineFileType } from '../../src/crawlfs.js';
import { walk } from './walk.js';
import path from 'node:path';
import { wrappedFs as fs } from '../../src/wrapped-fs.js';
import { AsarStreamType } from '../../src/asar.js';

export const createReadStreams = async (src: string) => {
  const filenames = walk(src);

  const streams = await Promise.all(
    filenames.map(async (filename): Promise<AsarStreamType> => {
      const meta = (await determineFileType(filename))!;
      if (meta.type === 'directory') {
        return {
          path: path.relative(src, filename),
          unpacked: filename.includes('x1'),
          type: meta.type,
        };
      }
      if (meta.type === 'file') {
        return {
          path: path.relative(src, filename),
          streamGenerator: () => fs.createReadStream(filename),
          unpacked: filename.includes('x1'),
          type: meta.type,
          stat: meta.stat,
        };
      }
      return {
        path: path.relative(src, filename),
        streamGenerator: () => fs.createReadStream(filename),
        symlink: await fs.readlink(filename),
        unpacked: filename.includes('x1'),
        type: meta.type,
        stat: meta.stat,
      };
    }),
  );
  return streams;
};

import { determineFileType } from '../../lib/crawlfs.js';
import { walk } from './walk.js';
import path from 'node:path';
import { wrappedFs as fs } from '../../lib/wrapped-fs.js';

export const createReadStreams = async (src: string) => {
  const filenames = walk(src);

  const streams = await Promise.all(
    filenames.map(async (filename) => {
      const meta = await determineFileType(filename);
      return {
        path: path.relative(src, filename),
        streamGenerator:
          meta.type === 'directory' ? undefined : () => fs.createReadStream(filename),
        symlink: meta.type === 'link' ? await fs.readlink(filename) : undefined,
        unpacked: filename.includes('x1'),
        type: meta.type,
        stat: meta.stat,
      };
    }),
  );
  return streams;
};

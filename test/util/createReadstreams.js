const { determineFileType } = require('../../lib/crawlfs');
const walk = require('./walk');
const path = require('path');
const fs = require('../../lib/wrapped-fs').default;

const collectReadStreams = async (src) => {
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

module.exports = collectReadStreams;

'use strict'

const fs = require('fs');
const glob = require('glob');

module.exports = (dir, options, callback) => {
  let metadata = {};
  glob(dir + '/**/*', options, (error, filenames) => {
    if (error) {
      callback(error);
    }
    let len = filenames.length
    for (let i = 0; i < len; i++) {
      let filename = filenames[i];
      let stat = fs.lstatSync(filename);
      if (stat.isFile()) {
        metadata[filename] = {
          type: 'file',
          stat: stat
        };
      } else if (stat.isDirectory()) {
        metadata[filename] = {
          type: 'directory',
          stat: stat
        };
      } else if (stat.isSymbolicLink()) {
        metadata[filename] = {
          type: 'link',
          stat: stat
        };
      }
    }
    callback(null, filenames, metadata);
  });
};

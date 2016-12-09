'use strict'

const fs = require('fs');
const glob = require('glob');

/**
 * Crawl file system.
 * @module     crawlfs
 * @param      {string}       dir          Base path. All files are relative to this.
 * @param      {object}       options      The options.
 * @param      {Function}     callback     The callback function. Accepts (err).
 * @return     {[type]}       [description]
 */
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

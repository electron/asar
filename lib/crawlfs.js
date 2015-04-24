var fs = require('fs');
var glob = require('glob');

module.exports = function crawlFilesystem(dir, cb) {
  var metadata = {};
  glob(dir + '/**/*', function(err, filenames) {
    filenames.forEach(function(filename) {
      var stat = fs.lstatSync(filename);
      if (stat.isFile()) {
        metadata[filename] = {type: 'file', stat: stat};
      }
      else if (stat.isDirectory()) {
        metadata[filename] = {type: 'directory', stat: stat};
      }
      else if (stat.isSymbolicLink()) {
        metadata[filename] = {type: 'link', stat: stat};
      }
    });

    cb(false, filenames, metadata);
  }).on('error', function(e) {
    cb(e);
  });
};

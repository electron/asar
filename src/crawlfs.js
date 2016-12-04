var fs = require('fs');
var glob = require('glob');

module.exports = function(dir, options, callback) {
  var metadata = {};
  return glob(dir + '/**/*', options, function(error, filenames) {
    if (error) { return callback(error); }
    for (var filename of filenames) {
      var stat = fs.lstatSync(filename);
      if (stat.isFile()) {
        metadata[filename] = {type: 'file', stat: stat};
      } else if (stat.isDirectory()) {
        metadata[filename] = {type: 'directory', stat: stat};
      } else if (stat.isSymbolicLink()) {
        metadata[filename] = {type: 'link', stat: stat};
      }
    }
    return callback(null, filenames, metadata);
  });
};

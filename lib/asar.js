var fs = require('fs');
var path = require('path');

var glob = require('glob');
var mkdirp = require('mkdirp');

var Filesystem = require('./filesystem');
var disk = require('./disk');

module.exports.createPackage = function(src, dest, cb) {
  var filesystem = new Filesystem(src);
  var files = [];
  glob(src + '/**/*', function(err, filenames) {
    if (err && 'function' === typeof cb)
      return cb(err);
    
    var i, file, stat, filename;

    for (i in filenames) {
      filename = filenames[i];
      stat = fs.lstatSync(filename);
      if (stat.isDirectory()) {
        filesystem.insertDirectory(filename);
      }
      else if (stat.isSymbolicLink()) {
        filesystem.insertLink(filename, stat);
      }
      else {
        filesystem.insertFile(filename, stat);
        files.push(filename);
      }
    }

    // create output dir if necessary
    mkdirp.sync(path.dirname(dest));

    disk.writeFilesystem(dest, filesystem, files, function() {
      if ('function' === typeof cb)
        cb(null);
    });
  });
};

module.exports.listPackage = function(archive) {
  return disk.readFilesystem(archive).listFiles()
};

module.exports.extractFile = function(archive, filename) {
  var filesystem = disk.readFilesystem(archive);
  return disk.readFile(filesystem, filesystem.getFile(filename));
};

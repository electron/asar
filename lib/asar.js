var fs = require('fs');
var path = require('path');

var walkdir = require('walkdir');
var mkdirp = require('mkdirp');

var Filesystem = require('./filesystem');
var disk = require('./disk');

module.exports.createPackage = function(src, dest, cb) {
  var filesystem = new Filesystem(src);
  var files = [];
  var walking = walkdir(filesystem.src);
  walking.on('directory', function(p, stat) {
    filesystem.insertDirectory(p);
  });
  walking.on('file', function(p, stat) {
    files.push(p);
    filesystem.insertFile(p, stat);
  });
  walking.on('link', function(p, stat) {
    filesystem.insertLink(p, stat);
  });
  walking.on('end', function() {
    disk.writeFilesystem(dest, filesystem, files);
    if ('function' === typeof cb) {
      cb(null);
    };
  });
};

module.exports.listPackage = function(archive) {
  return disk.readFilesystem(archive).listFiles()
}

module.exports.extractFile = function(archive, filename) {
  var filesystem = disk.readFilesystem(archive);
  return disk.readFile(filesystem, filesystem.getFile(filename));
}

module.exports.extractAll = function(archive, dest) {
  var filesystem = disk.readFilesystem(archive);
  var filenames = filesystem.listFiles();
  var i, content, file, filename, destFilename;

  mkdirp.sync(dest); // create destination directory

  for (i in filenames) {
    filename = filenames[i].substr(1); // get rid of leading slash
    destFilename = path.join(dest, filename);
    file = filesystem.getFile(filename);
    if (file.files) {
      // it's a directory, create it and continue with the next entry
      mkdirp.sync(destFilename);
      continue;
    }
    content = disk.readFile(filesystem, file);
    fs.writeFileSync(destFilename, content);
  }
  return true;
}

var Filesystem = require('./filesystem');
var disk = require('./disk');
var walkdir = require('walkdir');

module.exports.createPackage = function(src, dest) {
  var filesystem = new Filesystem(src);
  var files = [];
  var walking = walkdir(filesystem.src);
  walking.on('directory', function(p, stat) {
    filesystem.insertDirectoy(p);
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
  });
};

module.exports.listPackage = function(archive) {
  return disk.readFilesystem(archive).listFiles()
}

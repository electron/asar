var Filesystem = require('./filesystem');
var package = require('./package');
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
    package.writeToFile(dest, filesystem.json, files);
  });
};

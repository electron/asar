var Filesystem = require('./filesystem');
var pickle = require('chromium-pickle');
var walkdir = require('walkdir');

module.exports.createPackage = function(src, dest) {
  var filesystem = new Filesystem(src);
  var walking = walkdir(filesystem.src);
  walking.on('directory', function(p, stat) {
    filesystem.insertDirectoy(p);
  });
  walking.on('file', function(p, stat) {
    filesystem.insertFile(p, stat);
  });
  walking.on('link', function(p, stat) {
  });
  walking.on('end', function(p, stat) {
    console.log(JSON.stringify(filesystem.json));
  });
};

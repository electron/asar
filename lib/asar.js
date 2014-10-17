var Filesystem = require('./filesystem');
var disk = require('./disk');
var path = require('path');
var walkdir = require('walkdir');
var glob = require('glob').sync;

module.exports.createPackage = function(src, dest, excludeGlobs, includeGlobs) {
  excludeGlobs = excludeGlobs || [];
  includeGlobs = includeGlobs || [];
  var filesystem = new Filesystem(src);
  var files = [];
  var excludes = {};
  for (var i in excludeGlobs) {
      var matches = glob(excludeGlobs[i], {cwd: filesystem.src});

      for (var m in matches) {
        excludes[path.resolve(filesystem.src, matches[m])] = true
      }
  }

  var includes = {};
  for (var i in includeGlobs) {
      var matches = glob(includeGlobs[i], {cwd: filesystem.src});

      for (var m in matches) {
        includes[path.resolve(filesystem.src, matches[m])] = true
      }
  }

  var walking = walkdir(filesystem.src);
  walking.on('directory', function(p, stat) {
    if (shouldInclude(excludes, includes, p)) {
      filesystem.insertDirectoy(p);
    }
  });
  walking.on('file', function(p, stat) {
    if (shouldInclude(excludes, includes, p)) {
      files.push(p);
      filesystem.insertFile(p, stat);
    }
  });
  walking.on('link', function(p, stat) {
    if (shouldInclude(excludes, includes, p)) {
      filesystem.insertLink(p, stat);
    }
  });
  walking.on('end', function() {
    disk.writeFilesystem(dest, filesystem, files);
  });
};

module.exports.listPackage = function(archive) {
  return disk.readFilesystem(archive).listFiles()
}

module.exports.extractFile = function(archive, filename) {
  var filesystem = disk.readFilesystem(archive);
  return disk.readFile(filesystem, filesystem.getFile(filename));
}

function shouldInclude(excludes, includes, p) {
  // Directories match exactly, files should match adding a separator to the
  // glob match, this way only children of the glob match get matched.
  var excluded = false;

  for (var exclude in excludes) {
    if (exclude == p || p.match(exclude+path.sep+".*")) {
      excluded = true;
    }
  }

  if (!excluded) {
    return true;
  }

  for (var include in includes) {
    if (include == p || p.match(include+path.sep+".*")) {
      return true;
    }
  }

  return false;
}

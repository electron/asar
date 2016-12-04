var fs = require('fs');
var path = require('path');
var os = require('os');
var minimatch = require('minimatch');
var mkdirp = require('mkdirp');

var Filesystem = require('./filesystem');
var disk = require('./disk');
var crawlFilesystem = require('./crawlfs');
var createSnapshot = require('./snapshot');

// Return whether or not a directory should be excluded from packing due to
// "--unpack-dir" option
//
// @param {string} path - diretory path to check
// @param {string} pattern - literal prefix [for backward compatibility] or glob pattern
//
var isUnpackDir = function(path, pattern) {
  return path.indexOf(pattern) === 0 || minimatch(path, pattern);
};

module.exports.createPackage = function(src, dest, callback) {
  return module.exports.createPackageWithOptions(src, dest, {}, callback);
};

module.exports.createPackageWithOptions = function(src, dest, options, callback) {
  var {dot} = options;
  if (dot === undefined) { dot = true; }

  return crawlFilesystem(src, { dot: dot }, function(error, filenames, metadata) {
    if (error) { return callback(error); }
    module.exports.createPackageFromFiles(src, dest, filenames, metadata, options, callback);
  });
};

/*
createPackageFromFiles - Create an asar-archive from a list of filenames
src: Base path. All files are relative to this.
dest: Archive filename (& path).
filenames: Array of filenames relative to src.
metadata: Object with filenames as keys and {type='directory|file|link', stat: fs.stat} as values. (Optional)
options: The options.
callback: The callback function. Accepts (err).
*/
module.exports.createPackageFromFiles = function(src, dest, filenames, metadata, options, callback) {
  if (typeof metadata === 'undefined' || metadata === null) { metadata = {}; }
  var filesystem = new Filesystem(src);
  var files = [];

  if (options.ordering) {
    var orderingFiles = fs.readFileSync(options.ordering).toString().split('\n').map(function(line) {
      if (line.indexOf(':') !== -1) { line = line.split(':').pop(); }
      line = line.trim();
      if (line[0] === '/') { line = line.slice(1); }
      return line;
    });

    var ordering = [];
    for (var file of orderingFiles) {
      var pathComponents = file.split(path.sep);
      var str = src;
      for (var pathComponent of pathComponents) {
        str = path.join(str, pathComponent);
        ordering.push(str);
      }
    }

    var filenamesSorted = [];
    var missing = 0;
    var total = filenames.length;

    for (file of ordering) {
      if (filenamesSorted.indexOf(file) === -1 && filenames.indexOf(file) !== -1) {
        filenamesSorted.push(file);
      }
    }

    for (file of filenames) {
      if (filenamesSorted.indexOf(file) === -1) {
        filenamesSorted.push(file);
        missing += 1;
      }
    }

    console.log(`Ordering file has ${((total - missing) / total) * 100}% coverage.`);
  } else {
    var filenamesSorted = filenames;
  }

  var handleFile = function(filename, done) {
    var file = metadata[filename];
    if (!file) {
      var stat = fs.lstatSync(filename);
      if (stat.isDirectory()) { var type = 'directory'; }
      if (stat.isFile()) { var type = 'file'; }
      if (stat.isSymbolicLink()) { var type = 'link'; }
      file = {stat, type};
    }

    switch (file.type) {
      case 'directory':
        var shouldUnpack =
          options.unpackDir ?
            isUnpackDir(path.relative(src, filename), options.unpackDir)
          :
            false;
        filesystem.insertDirectory(filename, shouldUnpack);
        break;
      case 'file':
        shouldUnpack = false;
        if (options.unpack) {
          shouldUnpack = minimatch(filename, options.unpack, {matchBase: true});
        }
        if (!shouldUnpack && options.unpackDir) {
          var dirName = path.relative(src, path.dirname(filename));
          shouldUnpack = isUnpackDir(dirName, options.unpackDir);
        }
        files.push({filename: filename, unpack: shouldUnpack});
        filesystem.insertFile(filename, shouldUnpack, file, options, done);
        return;
        break;
      case 'link':
        filesystem.insertLink(filename, file.stat);
        break;
    }
    return process.nextTick(done);
  };

  var insertsDone = function() {
    return mkdirp(path.dirname(dest), function(error) {
      if (error) { return callback(error); }
      return disk.writeFilesystem(dest, filesystem, files, metadata, function(error) {
        if (error) { return callback(error); }
        if (options.snapshot) {
          return createSnapshot(src, dest, filenames, metadata, options, callback);
        } else {
          return callback(null);
        }
      });
    });
  };

  var names = filenamesSorted.slice();

  var next = function(name) {
    if (!name) { return insertsDone(); }

    return handleFile(name, function() {
      return next(names.shift());
    });
  };

  return next(names.shift());
};

module.exports.statFile = function(archive, filename, followLinks) {
  var filesystem = disk.readFilesystemSync(archive);
  return filesystem.getFile(filename, followLinks);
};

module.exports.listPackage = function(archive) {
  return disk.readFilesystemSync(archive).listFiles();
};

module.exports.extractFile = function(archive, filename) {
  var filesystem = disk.readFilesystemSync(archive);
  return disk.readFileSync(filesystem, filename, filesystem.getFile(filename));
};

module.exports.extractAll = function(archive, dest) {
  var destFilename;
  var file;
  var linkSrcPath;
  var linkDestPath;
  var relativePath;
  var linkTo;
  var content;
  var filesystem = disk.readFilesystemSync(archive);
  var filenames = filesystem.listFiles();

  // under windows just extract links as regular files
  var followLinks = process.platform === 'win32';

  // create destination directory
  mkdirp.sync(dest);

  return filenames.map((filename) =>
    (filename = filename.substr(1),  // get rid of leading slash
    destFilename = path.join(dest, filename),
    file = filesystem.getFile(filename, followLinks),
    file.files ?
      // it's a directory, create it and continue with the next entry
      mkdirp.sync(destFilename)
    : file.link ?
      // it's a symlink, create a symlink
      (linkSrcPath = path.dirname(path.join(dest, file.link)),
      linkDestPath = path.dirname(destFilename),
      relativePath = path.relative(linkDestPath, linkSrcPath),
      // try to delete output file, because we can't overwrite a link
      (() => { try {
        result.push(fs.unlinkSync(destFilename));
      } catch (error) {} })(),
      linkTo = path.join(relativePath, path.basename(file.link)),
      fs.symlinkSync(linkTo, destFilename))
    :
      // it's a file, extract it
      (content = disk.readFileSync(filesystem, filename, file),
      fs.writeFileSync(destFilename, content))));
};

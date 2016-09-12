'use strict'

let Filesystem, crawlFilesystem, createSnapshot, disk, isUnpackDir, minimatch, mkdirp;
let fs, os, path;
fs = require('fs');
path = require('path');
os = require('os');
minimatch = require('minimatch');
mkdirp = require('mkdirp');
Filesystem = require('./filesystem');
disk = require('./disk');
crawlFilesystem = require('./crawlfs');
createSnapshot = require('./snapshot');

isUnpackDir = (path, pattern) => {
  return path.indexOf(pattern) === 0 || minimatch(path, pattern);
};

module.exports.createPackage = (src, dest, callback) => {
  return module.exports.createPackageWithOptions(src, dest, {}, callback);
};

module.exports.createPackageWithOptions = (src, dest, options, callback) => {
  let dot = options.dot;
  if (dot === void 0) {
    dot = true;
  }
  crawlFilesystem(src, {
    dot: dot
  }, (error, filenames, metadata) => {
    if (error) {
      callback(error);
    }
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

module.exports.createPackageFromFiles = (src, dest, filenames, metadata, options, callback) => {
  metadata = metadata || {};
  let filesystem = new Filesystem(src);
  let files = [];
  let filenamesSorted = [];
  let missing = 0;
  let total = filenames.length;

  if (options.ordering) {
    orderingFiles = fs.readFileSync(options.ordering).toString().split('\n').map((line) => {
      if (line.indexOf(':') !== -1) {
        line = line.split(':').pop();
      }
      line = line.trim();
      if (line[0] === '/') {
        line = line.slice(1);
      }
      return line;
    })
    let ordering = [];
    for (let i = 0; i < orderingFiles.length; i++) {
      file = orderingFiles[i];
      pathComponents = file.split(path.sep);
      str = src;
      for (let j = 0; j < pathComponents.length; j++) {
        pathComponent = pathComponents[j];
        str = path.join(str, pathComponent);
        ordering.push(str);
      }
    }

    for (let i = 0; i < ordering.length; i++) {
      file = ordering[i];
      if (filenamesSorted.indexOf(file) === -1 && filenames.indexOf(file) !== -1) {
        filenamesSorted.push(file);
      }
    }
    for (let i = 0; i < filenames.length; i++) {
      file = filenames[i];
      if (filenamesSorted.indexOf(file) === -1) {
        filenamesSorted.push(file);
        missing += 1;
      }
    }
    console.log("Ordering file has " + ((total - missing) / total * 100) + "% coverage.");
  } else {
    filenamesSorted = filenames;
  }
  let handleFile = (filename, done) => {
    let dirName, shouldUnpack, stat, type;
    let file = metadata[filename];
    if (!file) {
      stat = fs.lstatSync(filename);
      if (stat.isDirectory()) {
        type = 'directory';
      }
      if (stat.isFile()) {
        type = 'file';
      }
      if (stat.isSymbolicLink()) {
        type = 'link';
      }
      file = {
        stat: stat,
        type: type
      };
    }
    switch (file.type) {
      case 'directory':
        shouldUnpack = options.unpackDir ? isUnpackDir(path.relative(src, filename), options.unpackDir) : false;
        filesystem.insertDirectory(filename, shouldUnpack);
        break;
      case 'file':
        shouldUnpack = false;
        if (options.unpack) {
          shouldUnpack = minimatch(filename, options.unpack, {
            matchBase: true
          });
        }
        if (!shouldUnpack && options.unpackDir) {
          dirName = path.relative(src, path.dirname(filename));
          shouldUnpack = isUnpackDir(dirName, options.unpackDir);
        }
        files.push({
          filename: filename,
          unpack: shouldUnpack
        });
        filesystem.insertFile(filename, shouldUnpack, file, options, done);
        return;
      case 'link':
        filesystem.insertLink(filename, file.stat);
    }
    return process.nextTick(done);
  };
  let insertsDone = () => {
    return mkdirp(path.dirname(dest), (error) => {
      if (error) {
        callback(error);
        return;
      }
      disk.writeFilesystem(dest, filesystem, files, metadata, (error) => {
        if (error) {
          callback(error);
          return;
        }
        if (options.snapshot) {
          createSnapshot(src, dest, filenames, metadata, options, callback);
        } else {
          callback(null);
        }
      });
    });
  };
  let names = filenamesSorted.slice();
  let next = function (name) {
    if (!name) {
      return insertsDone();
    }
    return handleFile(name, function () {
      next(names.shift());
    });
  };
  next(names.shift());
};

module.exports.statFile = function (archive, filename, followLinks) {
  let filesystem = disk.readFilesystemSync(archive);
  return filesystem.getFile(filename, followLinks);
};

module.exports.listPackage = function (archive) {
  return disk.readFilesystemSync(archive).listFiles();
};

module.exports.extractFile = function (archive, filename) {
  let filesystem = disk.readFilesystemSync(archive);
  return disk.readFileSync(filesystem, filename, filesystem.getFile(filename));
};

module.exports.extractAll = function (archive, dest) {
  let error;
  let filesystem = disk.readFilesystemSync(archive);
  let filenames = filesystem.listFiles();
  let followLinks = process.platform === 'win32';
  mkdirp.sync(dest);
  let results = [];
  let len = filenames.length
  for (let i = 0; i < len; i++) {
    let filename = filenames[i];
    filename = filename.substr(1);
    let destFilename = path.join(dest, filename);
    let file = filesystem.getFile(filename, followLinks);
    if (file.files) {
      results.push(mkdirp.sync(destFilename));
    } else if (file.link) {
      let linkSrcPath = path.dirname(path.join(dest, file.link));
      let linkDestPath = path.dirname(destFilename);
      let relativePath = path.relative(linkDestPath, linkSrcPath);
      try {
        fs.unlinkSync(destFilename);
      } catch (error1) {
        error = error1;
      }
      let linkTo = path.join(relativePath, path.basename(file.link));
      results.push(fs.symlinkSync(linkTo, destFilename));
    } else {
      let content = disk.readFileSync(filesystem, filename, file);
      results.push(fs.writeFileSync(destFilename, content));
    }
  }
  return results;
};

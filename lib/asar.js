'use strict'

let isUnpackDir;
const fs = require('fs');
const path = require('path');
const os = require('os');
const minimatch = require('minimatch');
const mkdirp = require('mkdirp');
const Filesystem = require('./filesystem');
const disk = require('./disk');
const crawlFilesystem = require('./crawlfs');
const createSnapshot = require('./snapshot');

isUnpackDir = (path, pattern) => {
  return path.indexOf(pattern) === 0 || minimatch(path, pattern);
};

module.exports.createPackage = (src, dest, callback) => {
  return module.exports.createPackageWithOptions(src, dest, {}, callback);
};
/**
 * Call createPackageFromFiles to create package with options.
 * @method     createPackageWithOptions
 * @param      {string}                     src          Base path. All files are relative to this.
 * @param      {string}                     dest         Archive filename (& path).
 * @param      {object}                     options      The options.
 * @param      {Function}                   callback     The callback function. Accepts (err).
 */
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


/**
 * Create an asar-archive from a list of filenames
 * @method     createPackageFromFiles
 * @param      {string}         src           Base path. All files are relative to this.
 * @param      {string}         dest          Archive filename (& path).
 * @param      {array}          filenames     Array of filenames relative to src.
 * @param      {object}         metadata      Object with filenames as keys and {type='directory|file|link', stat: fs.stat} as values. (Optional)
 * @param      {object}         options       The options.
 * @param      {Function}       callback      The callback function. Accepts (err).
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
    
    {
      let i, len;
      for (i = 0, len = orderingFiles.length; i < len; i++) {
        file = orderingFiles[i];
        pathComponents = file.split(path.sep);
        str = src;
        
        {
          let i,len;
          for (i = 0,len = pathComponents.length; i < len; i++) {
            pathComponent = pathComponents[i];
            str = path.join(str, pathComponent);
            ordering.push(str);
          }
        }
      }
    }

    {
      let i, len;
      for (i = 0,len = ordering.length; i < len; i++) {
        file = ordering[i];
        if (filenamesSorted.indexOf(file) === -1 && filenames.indexOf(file) !== -1) {
          filenamesSorted.push(file);
        }
      }
    }
    
    {
      let i, len;
      for (i = 0,len = filenames.length; i < len; i++) {
        file = filenames[i];
        if (filenamesSorted.indexOf(file) === -1) {
          filenamesSorted.push(file);
          missing += 1;
        }
      }
    }
    console.log("Ordering file has " + ((total - missing) / total * 100) + "% coverage.");
  } else {
    filenamesSorted = filenames;
  }
  /**
   * Save file handle.
   * @method     handleFile
   * @param      {string}       filename     File name string.
   * @param      {Function}     done         The next function.
   */
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
  /**
   * The insert done function.
   * @method     insertsDone
   */
  let insertsDone = () => {
    mkdirp(path.dirname(dest), (error) => {
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
  
  {
    let i, len;
    for (i = 0,len = filenames.length; i < len; i++) {
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
  }
  return results;
};

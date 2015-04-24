var fs = require('fs');
var path = require('path');
var os = require('os');

var minimatch = require('minimatch');
var mkdirp = require('mkdirp');

var Filesystem = require('./filesystem');
var disk = require('./disk');
var crawlFilesystem = require('./crawlfs');

module.exports.createPackage = function(src, dest, cb) {
  module.exports.createPackageWithOptions(src,dest, {}, cb);
}

module.exports.createPackageWithOptions = function(src, dest, options, cb) {
  crawlFilesystem(src, function(err, filenames, metadata) {
    var filesystem = new Filesystem(src);
    var files = [];
    var i, filename, file;
    for (i in filenames) {
      filename = filenames[i];
      file = metadata[filename];
      if ('directory' === file.type) {
        filesystem.insertDirectory(filename);
      }
      else if ('file' === file.type) {
        var shouldUnpack = false;
        if (options.unpack)
          shouldUnpack = minimatch(filename, options.unpack, {matchBase: true});

        files.push({filename: filename, unpack: shouldUnpack});
        filesystem.insertFile(filename, shouldUnpack, file.stat);
      }
      else if ('link' === file.type) {
        filesystem.insertLink(filename, file.stat);
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

module.exports.statFile = function(archive, filename, followLinks) {
  var filesystem = disk.readFilesystem(archive);
  return filesystem.getFile(filename, followLinks);
};

module.exports.listPackage = function(archive) {
  return disk.readFilesystem(archive).listFiles()
};

module.exports.extractFile = function(archive, filename) {
  var filesystem = disk.readFilesystem(archive);
  return disk.readFile(filesystem, filename, filesystem.getFile(filename));
};

module.exports.extractAll = function(archive, dest) {
  var filesystem = disk.readFilesystem(archive);
  var filenames = filesystem.listFiles();
  var i, content, file, filename, destFilename, linkTo;
  // under windows just extract links as regular files
  var followLinks = 'win32' === os.platform();

  mkdirp.sync(dest); // create destination directory

  for (i in filenames) {
    filename = filenames[i].substr(1); // get rid of leading slash
    destFilename = path.join(dest, filename);
    file = filesystem.getFile(filename, followLinks);
    if (file.files) {
      // it's a directory, create it and continue with the next entry
      mkdirp.sync(destFilename);
    }
    else if (file.link) {
      // it's a symlink, create a symlink
      var linkSrcPath = path.dirname(path.join(dest, file.link));
      var linkDestPath = path.dirname(destFilename);
      var relativePath = path.relative(linkDestPath, linkSrcPath);

      // try to delete output file, because we can't overwrite a link
      try {
        fs.unlinkSync(destFilename);
      }
      catch (err) {
      }

      linkTo = path.join(relativePath, path.basename(file.link));
      fs.symlinkSync(linkTo, destFilename);
    }
    else {
      // it's a file, extract it
      content = disk.readFile(filesystem, filename, file);
      fs.writeFileSync(destFilename, content);
    }
  }
  return true;
};

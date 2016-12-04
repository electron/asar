'use strict';
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var pickle = require('chromium-pickle-js');

var Filesystem = require('./filesystem');
var filesystemCache = {};

var copyFileToSync = function(dest, src, filename) {
  var srcFile = path.join(src, filename);
  var targetFile = path.join(dest, filename);

  var content = fs.readFileSync(srcFile);
  var stats = fs.statSync(srcFile);
  mkdirp.sync(path.dirname(targetFile));
  return fs.writeFileSync(targetFile, content, {mode: stats.mode});
};

var writeFileListToStream = function(dest, filesystem, out, list, metadata, callback) {
  if (list.length === 0) {
    out.end();
    return callback(null);
  }

  var file = list[0];
  if (file.unpack) {
    // the file should not be packed into archive.
    var filename = path.relative(filesystem.src, file.filename);
    try {
      copyFileToSync(`${dest}.unpacked`, filesystem.src, filename);
    } catch (error) {
      return callback(error);
    }
    return writeFileListToStream(dest, filesystem, out, list.slice(1), metadata, callback);
  } else {
    var tr = metadata[file.filename].transformed;
    var stream = fs.createReadStream((tr ? tr.path : file.filename));
    stream.pipe(out, {end: false});
    stream.on('error', callback);
    return stream.on('end', function() {
      return writeFileListToStream(dest, filesystem, out, list.slice(1), metadata, callback);
    });
  }
};

module.exports.writeFilesystem = function(dest, filesystem, files, metadata, callback) {
  try {
    var headerPickle = pickle.createEmpty();
    headerPickle.writeString(JSON.stringify(filesystem.header));
    var headerBuf = headerPickle.toBuffer();

    var sizePickle = pickle.createEmpty();
    sizePickle.writeUInt32(headerBuf.length);
    var sizeBuf = sizePickle.toBuffer();
  } catch (error) {
    return callback(error);
  }

  var out = fs.createWriteStream(dest);
  out.on('error', callback);
  out.write(sizeBuf);
  return out.write(headerBuf, function() {
    return writeFileListToStream(dest, filesystem, out, files, metadata, callback);
  });
};

module.exports.readArchiveHeaderSync = function(archive) {
  var fd = fs.openSync(archive, 'r');
  try {
    var sizeBuf = new Buffer(8);
    if (fs.readSync(fd, sizeBuf, 0, 8, null) !== 8) {
      throw new Error('Unable to read header size');
    }

    var sizePickle = pickle.createFromBuffer(sizeBuf);
    var size = sizePickle.createIterator().readUInt32();
    var headerBuf = new Buffer(size);
    if (fs.readSync(fd, headerBuf, 0, size, null) !== size) {
      throw new Error('Unable to read header');
    }
  } finally {
    fs.closeSync(fd);
  }

  var headerPickle = pickle.createFromBuffer(headerBuf);
  var header = headerPickle.createIterator().readString();
  return {header: JSON.parse(header), headerSize: size};
};

module.exports.readFilesystemSync = function(archive) {
  if (!filesystemCache[archive]) {
    var header = this.readArchiveHeaderSync(archive);
    var filesystem = new Filesystem(archive);
    filesystem.header = header.header;
    filesystem.headerSize = header.headerSize;
    filesystemCache[archive] = filesystem;
  }
  return filesystemCache[archive];
};

module.exports.readFileSync = function(filesystem, filename, info) {
  var buffer = new Buffer(info.size);
  if (info.size <= 0) { return buffer; }
  if (info.unpacked) {
    // it's an unpacked file, copy it.
    buffer = fs.readFileSync(path.join(`${filesystem.src}.unpacked`, filename));
  } else {
    // Node throws an exception when reading 0 bytes into a 0-size buffer,
    // so we short-circuit the read in this case.
    var fd = fs.openSync(filesystem.src, 'r');
    try {
      var offset = 8 + filesystem.headerSize + parseInt(info.offset);
      fs.readSync(fd, buffer, 0, info.size, offset);
    } finally {
      fs.closeSync(fd);
    }
  }
  return buffer;
};

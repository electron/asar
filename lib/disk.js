'use strict'

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const pickle = require('chromium-pickle-js');
const Filesystem = require('./filesystem');
let filesystemCache = {};

let copyFileToSync = (dest, src, filename) => {
  let srcFile = path.join(src, filename);
  let targetFile = path.join(dest, filename);
  let content = fs.readFileSync(srcFile);
  let stats = fs.statSync(srcFile);
  mkdirp.sync(path.dirname(targetFile));
  return fs.writeFileSync(targetFile, content, {
    mode: stats.mode
  });
};

let writeFileListToStream = (dest, filesystem, out, list, metadata, callback) => {
  if (list.length === 0) {
    out.end();
    callback(null);
  }
  let file = list[0];
  if (file.unpack) {
    let filename = path.relative(filesystem.src, file.filename);
    try {
      copyFileToSync(dest + ".unpacked", filesystem.src, filename);
    } catch (error) {
      callback(error);
    }
    writeFileListToStream(dest, filesystem, out, list.slice(1), metadata, callback);
  } else {
    let tr = metadata[file.filename].transformed;
    let stream = fs.createReadStream((tr ? tr.path : file.filename));
    stream.pipe(out, {
      end: false
    });
    stream.on('error', callback);
    stream.on('end', () => {
      writeFileListToStream(dest, filesystem, out, list.slice(1), metadata, callback);
    });
  }
};

module.exports.writeFilesystem = (dest, filesystem, files, metadata, callback) => {
  let headerPickle, headerBuf, sizePickle, sizeBuf;
  try {
    headerPickle = pickle.createEmpty();
    headerPickle.writeString(JSON.stringify(filesystem.header));
    headerBuf = headerPickle.toBuffer();
    sizePickle = pickle.createEmpty();
    sizePickle.writeUInt32(headerBuf.length);
    sizeBuf = sizePickle.toBuffer();
  } catch (error) {
    callback(error);
  }
  let out = fs.createWriteStream(dest);
  out.on('error', callback);
  out.write(sizeBuf);
  out.write(headerBuf, () => {
    writeFileListToStream(dest, filesystem, out, files, metadata, callback);
  });
};

module.exports.readArchiveHeaderSync = (archive) => {
  let headerPickle, size, sizeBuf, sizePickle, headerBuf;
  let fd = fs.openSync(archive, 'r');
  try {
    sizeBuf = new Buffer(8);
    if (fs.readSync(fd, sizeBuf, 0, 8, null) !== 8) {
      throw new Error('Unable to read header size');
    }
    sizePickle = pickle.createFromBuffer(sizeBuf);
    size = sizePickle.createIterator().readUInt32();
    headerBuf = new Buffer(size);
    if (fs.readSync(fd, headerBuf, 0, size, null) !== size) {
      throw new Error('Unable to read header');
    }
  } finally {
    fs.closeSync(fd);
  }
  headerPickle = pickle.createFromBuffer(headerBuf);
  let header = headerPickle.createIterator().readString();
  return {
    header: JSON.parse(header),
    headerSize: size
  };
};

module.exports.readFilesystemSync = (archive) => {
  if (!filesystemCache[archive]) {
    let header = this.readArchiveHeaderSync(archive);
    let filesystem = new Filesystem(archive);
    filesystem.header = header.header;
    filesystem.headerSize = header.headerSize;
    filesystemCache[archive] = filesystem;
  }
  return filesystemCache[archive];
};

module.exports.readFileSync = (filesystem, filename, info) => {
  let buffer = new Buffer(info.size);
  if (info.size <= 0) {
    return buffer;
  }
  if (info.unpacked) {
    buffer = fs.readFileSync(path.join(filesystem.src + ".unpacked", filename));
  } else {
    let fd = fs.openSync(filesystem.src, 'r');
    try {
      let offset = 8 + filesystem.headerSize + parseInt(info.offset);
      fs.readSync(fd, buffer, 0, info.size, offset);
    } finally {
      fs.closeSync(fd);
    }
  }
  return buffer;
};

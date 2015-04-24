var fs = require('fs');
var path = require('path');

var mkdirp = require('mkdirp');
var pickle = require('chromium-pickle-js');

var Filesystem = require('./filesystem');

var filesystemCache = {};

var copyFileTo = function(dest, src, filename) {
  var srcFile = path.join(src, filename)
  var content = fs.readFileSync(srcFile);
  var stats = fs.statSync(srcFile);
  var targetFile = path.join(dest, filename);
  mkdirp.sync(path.dirname(targetFile));
  fs.writeFileSync(targetFile, content, {mode: stats.mode});
}

var writeFileListToStream = function(dest, filesystem, out, list, cb) {
  if (list.length == 0) {
    out.end();
    if ('function' === typeof cb) {
      cb(null);
    }
    return;
  }

  var file = list[0];

  // the file should not be packed into archive.
  if (file.unpack) {
    copyFileTo(dest + '.unpacked', filesystem.src, path.relative(filesystem.src, file.filename));
    return writeFileListToStream(dest, filesystem, out, list.slice(1), cb);
  }

  var src = fs.createReadStream(file.filename);
  src.on('end', writeFileListToStream.bind(this, dest, filesystem, out, list.slice(1), cb));
  src.pipe(out, { end: false });
};

module.exports.writeFilesystem = function(dest, filesystem, files, cb) {
  var headerPickle = pickle.createEmpty();
  headerPickle.writeString(JSON.stringify(filesystem.header));
  var headerBuf = headerPickle.toBuffer();

  var sizePickle = pickle.createEmpty();
  sizePickle.writeUInt32(headerBuf.length);
  var sizeBuf = sizePickle.toBuffer();

  var out = fs.createWriteStream(dest);
  out.write(sizeBuf);
  out.write(headerBuf, writeFileListToStream.bind(this, dest, filesystem, out, files, cb));
};

module.exports.readArchiveHeader = function(archive) {
  var fd = fs.openSync(archive, 'r');
  var sizeBuf = new Buffer(8);
  if (fs.readSync(fd, sizeBuf, 0, 8, null) != 8)
    throw new Error('Unable to read header size');

  var sizePickle = pickle.createFromBuffer(sizeBuf);
  var size = sizePickle.createIterator().readUInt32();
  var headerBuf = new Buffer(size);
  if (fs.readSync(fd, headerBuf, 0, size, null) != size)
    throw new Error('Unable to read header');
  fs.closeSync(fd);

  var headerPickle = pickle.createFromBuffer(headerBuf);
  var header = headerPickle.createIterator().readString();
  return { header: JSON.parse(header), headerSize: size };
};

module.exports.readFilesystem = function(archive) {
  if (!filesystemCache[archive]) {
    var header = this.readArchiveHeader(archive);
    var filesystem = new Filesystem(archive);
    filesystem.header = header.header;
    filesystem.headerSize = header.headerSize;
    filesystemCache[archive] = filesystem;
  }
  return filesystemCache[archive];
};

module.exports.readFile = function(filesystem, filename, info) {
  var buffer = new Buffer(info.size);
  if (info.size <= 0)
    return buffer;

  if (info.unpacked) {
    // it's an unpacked file, copy it.
    buffer = fs.readFileSync(path.join(filesystem.src + '.unpacked', filename));
  }
  else {
    // Node throws an exception when reading 0 bytes into a 0-size buffer,
    // so we short-circuit the read in this case.
    var fd = fs.openSync(filesystem.src, 'r');
    fs.readSync(fd, buffer, 0, info.size,
                8 + filesystem.headerSize + parseInt(info.offset));
    fs.closeSync(fd);
  }
  return buffer;
}

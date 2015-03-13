var Filesystem = require('./filesystem');
var fs = require('fs');
var pickle = require('chromium-pickle');

var writeFileListToStream = function(out, list, cb) {
  if (list.length == 0) {
    out.end();
    if ('function' === typeof cb) {
      cb(null);
    }
    return;
  }

  var src = fs.createReadStream(list[0]);
  src.on('end', writeFileListToStream.bind(this, out, list.slice(1), cb));
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
  out.write(headerBuf, writeFileListToStream.bind(this, out, files, cb));
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
  var header = this.readArchiveHeader(archive);
  var filesystem = new Filesystem(archive);
  filesystem.header = header.header;
  filesystem.headerSize = header.headerSize;
  return filesystem;
};

module.exports.readFile = function(filesystem, info) {
  var buffer = new Buffer(info.size);
  if (info.size > 0) {
    // Node throws an exception when reading 0 bytes into a 0-size buffer,
    // so we short-circuit the read in this case.
    var fd = fs.openSync(filesystem.src, 'r');
    fs.readSync(fd, buffer, 0, info.size,
                8 + filesystem.headerSize + parseInt(info.offset));
    fs.closeSync(fd);
  }
  return buffer;
}

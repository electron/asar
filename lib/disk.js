var Filesystem = require('./filesystem');
var fs = require('fs');
var pickleHeader = new Buffer([0x04, 0x00, 0x00, 0x00, 0xfc, 0x00, 0x00, 0x00, 0xf8, 0x00, 0x00, 0x00]);

var writeFileListToStream = function(out, list, cb) {
  if (list.length === 0) {
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
  var headerBuf = new Buffer(JSON.stringify(filesystem.header), 'utf8');
  var sizeBuf = new Buffer(4);

  sizeBuf.writeUInt32LE(headerBuf.length);

  var out = fs.createWriteStream(dest);
  out.write(pickleHeader);
  out.write(sizeBuf);
  out.write(headerBuf);
  out.write(new Buffer([0x00, 0x00]), writeFileListToStream.bind(this, out, files, cb));
};

module.exports.readArchiveHeader = function(archive) {
  var fd = fs.openSync(archive, 'r');

  var sizeBuf = new Buffer(16);
  if (fs.readSync(fd, sizeBuf, 0, 16, 0) !== 16)
    throw new Error('Unable to read header size');

  var size = sizeBuf.slice(-4).readUInt32LE();
  var headerBuf = new Buffer(size);

  if (fs.readSync(fd, headerBuf, 0, size, 16) !== size)
    throw new Error('Unable to read header');
  fs.closeSync(fd);

  var header = headerBuf.toString('utf8');
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
                18 + filesystem.headerSize + parseInt(info.offset));
    fs.closeSync(fd);
  }
  return buffer;
}

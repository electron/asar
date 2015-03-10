var fs = require('fs');
var pickleHeader = new Buffer([0x04, 0x00, 0x00, 0x00, 0xfc, 0x00, 0x00, 0x00, 0xf8, 0x00, 0x00, 0x00]);
var headerTerminator = new Buffer([0x00, 0x00]);
var pickleSizeOffset = -4;

var getHeaderSize = function(fd) {
  var sizeBuf = new Buffer(16);

  if (fs.readSync(fd, sizeBuf, 0, 16, 0) !== 16)
    throw new Error('Unable to read header size');

  return sizeBuf.slice(pickleSizeOffset).readUInt32LE(0);
};

var getHeaderContent = function(fd, size) {
  var headerBuf = new Buffer(size);
  if (fs.readSync(fd, headerBuf, 0, size, 16) !== size)
    throw new Error('Unable to read header');

  return headerBuf.toString('utf8');
};

var writeHeader = function(dest, headerBuffer, sizeBuffer, callback) {
  dest.write(pickleHeader);
  dest.write(sizeBuffer);
  dest.write(headerBuffer);
  dest.write(headerTerminator, callback);
};

exports.read = function(archive) {
  var fd = fs.openSync(archive, 'r');

  var size = getHeaderSize(fd);
  var content = getHeaderContent(fd, size);
  fs.closeSync(fd);

  return { content: content, size: size };
};

exports.write = function(dest, header, callback) {
  var headerBuf = new Buffer(JSON.stringify(header), 'utf8');
  var headerSize = headerBuf.length;
  var sizeBuf = new Buffer(4);

  sizeBuf.writeUInt32LE(headerSize, 0);

  writeHeader(dest, headerBuf, sizeBuf, callback);
};

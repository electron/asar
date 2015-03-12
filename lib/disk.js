var Filesystem = require('./filesystem');
var Header = require('./header');
var fs = require('fs');

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
  var out = fs.createWriteStream(dest);
  Header.write(out, filesystem.header, writeFileListToStream.bind(this, out, files, cb));
};

module.exports.readArchiveHeader = function(archive) {
  var header = Header.read(archive);
  return { header: JSON.parse(header.content), headerSize: header.size };
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

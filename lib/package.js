var fs = require('fs');
var pickle = require('chromium-pickle');

var writeFileListToStream = function(out, list) {
  if (list.length == 0) {
    out.end();
    return;
  }

  var src = fs.createReadStream(list[0]);
  src.on('end', writeFileListToStream.bind(this, out, list.slice(1)));
  src.pipe(out, { end: false });
}

module.exports.writeToFile = function(dest, json, files) {
  var header = pickle.createEmpty();
  header.writeString(JSON.stringify(json));
  headerBuf = header.toBuffer();

  var size = pickle.createEmpty();
  size.writeUInt32(headerBuf.length);
  sizeBuf = size.toBuffer();

  var out = fs.createWriteStream(dest);
  out.write(sizeBuf);
  out.write(headerBuf, writeFileListToStream.bind(this, out, files));
}

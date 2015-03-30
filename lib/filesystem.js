var fs = require('fs');
var path = require('path');
var UINT64 = require('cuint').UINT64;

function Filesystem(src) {
  this.src = path.resolve(src);
  this.header = { files: {} };
  this.offset = UINT64(0);
}

Filesystem.prototype.searchNodeFromDirectory = function(p) {
  var json = this.header;
  var dirs = p.split(path.sep);
  for (var i in dirs)
    if (dirs[i] != '.')
      json = json.files[dirs[i]];
  return json;
};

Filesystem.prototype.searchNodeFromPath = function(p) {
  p = path.relative(this.src, p);
  var name = path.basename(p);
  var node = this.searchNodeFromDirectory(path.dirname(p)).files[name] = {};
  return node;
}

Filesystem.prototype.insertDirectory = function(p) {
  var node = this.searchNodeFromPath(p);
  node.files = {};
};

Filesystem.prototype.insertFile = function(p, shouldUnpack, stat) {
  var node = this.searchNodeFromPath(p);
  if (shouldUnpack) {
    node.size = stat.size;
    node.unpacked = true;
    return;
  }

  // JavaScript can not precisely present integers >= UINT32_MAX.
  if (stat.size > 4294967295)
    throw new Error(p + ': file size can not be larger than 4.2GB');

  node.size = stat.size;
  node.offset = this.offset.toString();
  if ((process.platform != 'win32') && (stat.mode & 0100))
    node.executable = true;
  this.offset.add(UINT64(stat.size));
};

Filesystem.prototype.insertLink = function(p, stat) {
  var link = path.relative(fs.realpathSync(this.src), fs.realpathSync(p));
  if (link.substr(0, 2) == '..')
    throw new Error(p + ': file links out of the package');

  var node = this.searchNodeFromPath(p);
  node.link = link;
}

Filesystem.prototype.listFiles = function() {
  files = [];
  var fillFilesFromHeader = function(p, json) {
    if (!json.files)
      return;
    for (f in json.files) {
      var fullPath = path.join(p, f);
      files.push(fullPath);
      fillFilesFromHeader(fullPath, json.files[f]);
    }
  };
  fillFilesFromHeader('/', this.header);
  return files;
}

Filesystem.prototype.getNode = function(p) {
  var node = this.searchNodeFromDirectory(path.dirname(p));
  var name = path.basename(p);
  if (name)
    return node.files[name];
  else
    return node;
}

Filesystem.prototype.getFile = function(p, followLinks) {
  var info = this.getNode(p);
  if ('undefined' === typeof followLinks)
    followLinks = true;
  // if followLinks is false we don't resolve symlinks
  if (!info.link || !followLinks)
    return info;
  return this.getFile(info.link);
}

module.exports = Filesystem;

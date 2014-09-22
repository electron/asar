var fs = require('fs');
var path = require('path');
var UINT64 = require('cuint').UINT64;

function Filesystem(src) {
  this.src = path.resolve(src);
  this.json = { files: {} };
  this.offset = UINT64(0);
}

Filesystem.prototype.searchNodeFromDirectory = function(p) {
  var json = this.json;
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

Filesystem.prototype.insertDirectoy = function(p) {
  var node = this.searchNodeFromPath(p);
  node.files = {};
};

Filesystem.prototype.insertFile = function(p, stat) {
  // JavaScript can not precisely present integers >= UINT32_MAX.
  if (stat.size > 4294967295)
    throw new Error(p + ': file size can not be larger than 4.2GB');

  var node = this.searchNodeFromPath(p);
  node.size = stat.size;
  node.offset = this.offset.toString();
  if ((process.platform != 'win32') && (stat.mode & 0100))
    node.executable = true;
  this.offset.add(UINT64(stat.size));
};

Filesystem.prototype.insertLink = function(p, stat) {
  var link = fs.realpathSync(p);
  link = path.relative(this.src, link);
  if (link.substr(0, 2) == '..')
    throw new Error(p + ': file links out of the package');

  var node = this.searchNodeFromPath(p);
  node.link = link;
}

module.exports = Filesystem;

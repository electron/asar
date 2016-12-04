var fs = require('fs');
var path = require('path');
var tmp = require('tmp');
var UINT64 = require('cuint').UINT64;

class Filesystem {
  constructor(src) {
    this.src = path.resolve(src);
    this.header = {files: {}};
    this.offset = UINT64(0);
  }

  searchNodeFromDirectory(p) {
    var json = this.header;
    var dirs = p.split(path.sep);
    for (var dir of dirs) { if (dir !== '.') { json = json.files[dir]; } }
    return json;
  }

  searchNodeFromPath(p) {
    p = path.relative(this.src, p);
    if (!p) { return this.header; }
    var name = path.basename(p);
    var node = this.searchNodeFromDirectory(path.dirname(p));
    if (node.files == null) { node.files = {}; }
    if (node.files[name] == null) { node.files[name] = {}; }
    return node.files[name];
  }

  insertDirectory(p, shouldUnpack) {
    var node = this.searchNodeFromPath(p);
    if (shouldUnpack) { node.unpacked = shouldUnpack; }
    return node.files = {};
  }

  insertFile(p, shouldUnpack, file, options, callback) {
    var dirNode = this.searchNodeFromPath(path.dirname(p));
    var node = this.searchNodeFromPath(p);
    if (shouldUnpack || dirNode.unpacked) {
      node.size = file.stat.size;
      node.unpacked = true;
      process.nextTick(callback);
      return;
    }

    var handler = () => {
      var size = file.transformed ? file.transformed.stat.size : file.stat.size;

      // JavaScript can not precisely present integers >= UINT32_MAX.
      if (size > 4294967295) {
        throw new Error(`${p}: file size can not be larger than 4.2GB`);
      }

      node.size = size;
      node.offset = this.offset.toString();
      if (process.platform !== 'win32' && (file.stat.mode & 0o100)) {
        node.executable = true;
      }
      this.offset.add(UINT64(size));

      return callback();
    };

    var tr = options.transform && options.transform(p);
    if (tr) {
      return tmp.file(function(err, path) {
        if (err) { return handler(); }
        var out = fs.createWriteStream(path);
        var stream = fs.createReadStream(p);

        stream.pipe(tr).pipe(out);
        return tr.on('end', function() {
          file.transformed = {
            path,
            stat: fs.lstatSync(path)
          };
          return handler();
        });
      });
    } else {
      return process.nextTick(handler);
    }
  }

  insertLink(p, stat) {
    var link = path.relative(fs.realpathSync(this.src), fs.realpathSync(p));
    if (link.substr(0, 2) === '..') {
      throw new Error(`${p}: file links out of the package`);
    }
    var node = this.searchNodeFromPath(p);
    return node.link = link;
  }

  listFiles() {
    var files = [];
    var fillFilesFromHeader = function(p, json) {
      if (!json.files) {
        return;
      }
      return (() => {
        var result = [];
        for (var f in json.files) {
          var fullPath = path.join(p, f);
          files.push(fullPath);
          result.push(fillFilesFromHeader(fullPath, json.files[f]));
        }
        return result;
      })();
    };

    fillFilesFromHeader('/', this.header);
    return files;
  }

  getNode(p) {
    var node = this.searchNodeFromDirectory(path.dirname(p));
    var name = path.basename(p);
    if (name) {
      return node.files[name];
    } else {
      return node;
    }
  }

  getFile(p, followLinks=true) {
    var info = this.getNode(p);

    // if followLinks is false we don't resolve symlinks
    if (info.link && followLinks) {
      return this.getFile(info.link);
    } else {
      return info;
    }
  }
}

module.exports = Filesystem;

'use strict'

const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const UINT64 = require('cuint').UINT64;
const Filesystem = (() => {
  function Filesystem(src) {
    this.src = path.resolve(src);
    this.header = {
      files: {}
    };
    this.offset = UINT64(0);
  }

  Filesystem.prototype.searchNodeFromDirectory = function (p) {
    let json = this.header;
    let dirs = p.split(path.sep);
    for (let i = 0; i < dirs.length; i++) {
      let dir = dirs[i];
      if (dir !== '.') {
        json = json.files[dir];
      }
    }
    return json;
  };

  Filesystem.prototype.searchNodeFromPath = function (p) {
    let base;
    p = path.relative(this.src, p);
    if (!p) {
      return this.header;
    }
    let name = path.basename(p);
    let node = this.searchNodeFromDirectory(path.dirname(p));
    node.files = node.files || {};
    if ((base = node.files)[name] == null) {
      base[name] = {};
    }
    return node.files[name];
  };

  Filesystem.prototype.insertDirectory = function (p, shouldUnpack) {
    let node = this.searchNodeFromPath(p);
    // IF we have shouldUnpack then shouldUnpack,another way don't change.
    node.unpacked = shouldUnpack || node.unpacked;
    return node.files = {};
  };

  Filesystem.prototype.insertFile = function (p, shouldUnpack, file, options, callback) {
    let dirNode = this.searchNodeFromPath(path.dirname(p));
    let node = this.searchNodeFromPath(p);
    if (shouldUnpack || dirNode.unpacked) {
      node.size = file.stat.size;
      node.unpacked = true;
      process.nextTick(callback);
      return;
    }
    let handler = ((_this) => {
      return () => {
        let size = file.transformed ? file.transformed.stat.size : file.stat.size;
        if (size > 4294967295) {
          throw new Error(p + ": file size can not be larger than 4.2GB");
        }
        node.size = size;
        node.offset = _this.offset.toString();
        if (process.platform !== 'win32' && file.stat.mode & 0x40) {
          node.executable = true;
        }
        _this.offset.add(UINT64(size));
        callback();
      };
    })(this);
    let tr = options.transform && options.transform(p);
    if (tr) {
      tmp.file(function (err, path) {
        if (err) {
          handler();
        }else {
          let out = fs.createWriteStream(path);
          let stream = fs.createReadStream(p);
          stream.pipe(tr).pipe(out);
          tr.on('end', function () {
            file.transformed = {
              path: path,
              stat: fs.lstatSync(path)
            };
            handler();
          });
        }
      });
    } else {
      process.nextTick(handler);
    }
  };

  Filesystem.prototype.insertLink = function (p, stat) {
    let link = path.relative(fs.realpathSync(this.src), fs.realpathSync(p));
    if (link.substr(0, 2) === '..') {
      throw new Error(p + ": file links out of the package");
    }
    let node = this.searchNodeFromPath(p);
    return node.link = link;
  };

  Filesystem.prototype.listFiles = function () {
    let files = [];
    let fillFilesFromHeader = function (p, json) {
      var f, fullPath, results;
      if (!json.files) {
        return;
      }
      results = [];
      for (f in json.files) {
        fullPath = path.join(p, f);
        files.push(fullPath);
        results.push(fillFilesFromHeader(fullPath, json.files[f]));
      }
      return results;
    };
    fillFilesFromHeader('/', this.header);
    return files;
  };

  Filesystem.prototype.getNode = function (p) {
    let node = this.searchNodeFromDirectory(path.dirname(p));
    let name = path.basename(p);
    if (name) {
      return node.files[name];
    } else {
      return node;
    }
  };

  Filesystem.prototype.getFile = function (p, followLinks) {
    followLinks = followLinks || true;
    let info = this.getNode(p);
    if (info.link && followLinks) {
      return this.getFile(info.link);
    } else {
      return info;
    }
  };

  return Filesystem;

})();

module.exports = Filesystem;

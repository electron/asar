fs = require('fs');
path = require('path');
walkdir = require('walkdir');
_ = require('lodash');

var crawlFilesystem = function(dir, cb) {
  var paths = [];
  var metadata = {};

  var emitter = walkdir(dir);
  emitter.on('directory', function(p, stat) {
    p = path.relative(dir, p);
    paths.push(p);
    metadata[p] = {type: 'directory', stat: stat};
  });
  emitter.on('file', function(p, stat) {
    p = path.relative(dir, p);
    paths.push(p);
    metadata[p] = {type: 'file', stat: stat};
  });
  emitter.on('link', function(p, stat) {
    p = path.relative(dir, p);
    paths.push(p);
    metadata[p] = {type: 'link', stat: stat};
  });
  emitter.on('end', function() {
    paths.sort();
    cb(false, paths, metadata);
  });
  emitter.on('error', function(err) {
    cb(err);
  });
};

module.exports = function(dirA, dirB, cb) {
  crawlFilesystem(dirA, function(err, pathsA, metadataA) {
    crawlFilesystem(dirB, function(err, pathsB, metadataB) {
      var onlyInA = _.difference(pathsA, pathsB);
      var onlyInB = _.difference(pathsB, pathsA);
      var inBoth = _.intersection(pathsA, pathsB);
      var differentFiles = [];
      var i, filename, fileContentA, fileContentB, typeA, typeB;
      var isIdentical;
      var errorMsg = '\n';

      for (i in inBoth) {
        filename = inBoth[i];
        typeA = metadataA[filename].type;
        typeB = metadataB[filename].type;
        // skip if both are directories
        if('directory' === typeA && 'directory' === typeB)
          continue;
        // something is wrong if one entry is a file and the other is a directory
        // (do a XOR with the ternary operator)
        if('directory' === typeA ? 'directory' !== typeB : 'directory' === typeB) {
          differentFiles.push(filename);
          continue;
        }
        fileContentA = fs.readFileSync(path.join(dirA, filename), 'utf8');
        fileContentB = fs.readFileSync(path.join(dirB, filename), 'utf8');
        if(fileContentA !== fileContentB)
          differentFiles.push(filename);
      }

      if (onlyInA.length) {
        errorMsg += '\tEntries only in "' + dirA + '":\n';
        for (i in onlyInA)
          errorMsg += '\t  ' + onlyInA[i] + '\n';
      }
      if (onlyInB.length) {
        errorMsg += '\tEntries only in "' + dirB + '"\n';
        for (i in onlyInB)
          errorMsg += '\t  ' + onlyInB[i] + '\n';
      }
      if (differentFiles.length) {
        errorMsg += '\tDifferent file content:\n';
        for (i in differentFiles)
          errorMsg += '\t  ' + differentFiles[i] + '\n';
      }

      isIdentical = !onlyInA.length && !onlyInB.length && !differentFiles.length;

      cb(isIdentical ? null : new Error(errorMsg));
    });
  });
}
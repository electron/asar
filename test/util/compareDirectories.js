fs = require('fs');
path = require('path');
walkdir = require('walkdir');
_ = require('lodash');

var crawlFilesystem = function(dir, cb) {
  var paths = [];

  var emitter = walkdir(dir);
  emitter.on('directory', function(p, stat) {
    p = path.relative(dir, p);
    paths.push(p);
  });
  emitter.on('file', function(p, stat) {
    p = path.relative(dir, p);
    paths.push(p);
  });
  emitter.on('link', function(p, stat) {
    p = path.relative(dir, p);
    paths.push(p);
  });
  emitter.on('end', function() {
    paths.sort();
    cb(false, paths);
  });
  emitter.on('error', function(err) {
    cb(err);
  });
};

module.exports = function(dirA, dirB, cb) {
  crawlFilesystem(dirA, function(err, pathsA) {
    crawlFilesystem(dirB, function(err, pathsB) {
      var onlyInA = _.difference(pathsA, pathsB);
      var onlyInB = _.difference(pathsB, pathsA);
      var inBoth = _.intersection(pathsA, pathsB);
      var differentFiles = [];
      var i, filename, fileContentA, fileContentB;
      var isIdentical;
      var errorMsg = '\n';

      for (i in inBoth) {
        filename = inBoth[i];
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
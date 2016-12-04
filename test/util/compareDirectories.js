'use strict';
var fs = require('fs');
var path = require('path');

var _ = require('lodash');

var crawlFilesystem = require('../../src/crawlfs');

module.exports = function(dirA, dirB, cb) {
  crawlFilesystem(dirA, function(err, pathsA, metadataA) {
    crawlFilesystem(dirB, function(err, pathsB, metadataB) {
      var relativeA = _.map(pathsA, function(pathAItem) { return path.relative(dirA, pathAItem); });
      var relativeB = _.map(pathsB, function(pathBItem) { return path.relative(dirB, pathBItem); });
      var onlyInA = _.difference(relativeA, relativeB);
      var onlyInB = _.difference(relativeB, relativeA);
      var inBoth = _.intersection(pathsA, pathsB);
      var differentFiles = [];
      var errorMsgBuilder = [];
      err = null;
      for (var i in inBoth) {
        var filename = inBoth[i];
        var typeA = metadataA[filename].type;
        var typeB = metadataB[filename].type;
        // skip if both are directories
        if ('directory' === typeA && 'directory' === typeB) { continue; }
        // something is wrong if the types don't match up
        if (typeA !== typeB) {
          differentFiles.push(filename);
          continue;
        }
        var fileContentA = fs.readFileSync(path.join(dirA, filename), 'utf8');
        var fileContentB = fs.readFileSync(path.join(dirB, filename), 'utf8');
        if (fileContentA !== fileContentB) { differentFiles.push(filename); }
      }
      if (onlyInA.length) {
        errorMsgBuilder.push(`\tEntries only in '${dirA}':`);
        for (var file of onlyInA) { errorMsgBuilder.push(`\t  ${file}`); }
      }
      if (onlyInB.length) {
        errorMsgBuilder.push(`\tEntries only in '${dirB}':`);
        for (var file of onlyInB) { errorMsgBuilder.push(`\t  ${file}`); }
      }
      if (differentFiles.length) {
        errorMsgBuilder.push("\tDifferent file content:");
        for (var file of differentFiles) { errorMsgBuilder.push(`\t  ${file}`); }
      }
      if (errorMsgBuilder.length) { err = new Error("\n" + errorMsgBuilder.join("\n")); }
      cb(err);
    });
  });
};

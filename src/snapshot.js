'use strict';
var fs = require('fs');
var path = require('path');
var mksnapshot = require('mksnapshot');
var vm = require('vm');

var stripBOM = function(content) {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
};

var wrapModuleCode = function(script) {
  script = script.replace(/^\#\!.*/, '');
  return `(function(exports, require, module, __filename, __dirname) { ${script} \n});`;
};

var dumpObjectToJS = function(content) {
  var result = 'var __ATOM_SHELL_SNAPSHOT = {\n';
  for (var filename in content) {
    var func = content[filename].toString();
    result += `  '${filename}': ${func},\n`;
  }
  result += '};\n';
  return result;
};

var createSnapshot = function(src, dest, filenames, metadata, options, callback) {
  try {
    src = path.resolve(src);
    var content = {};
    for (var filename of filenames) {
      var file = metadata[filename];
      if ((file.type === 'file' || file.type === 'link') &&
         filename.substr(-3) === '.js') {
        var script = wrapModuleCode(stripBOM(fs.readFileSync(filename, 'utf8')));
        var relativeFilename = path.relative(src, filename);
        try {
          var compiled = vm.runInThisContext(script, {filename: relativeFilename});
          content[relativeFilename] = compiled;
        } catch (error) {
          console.error('Ignoring ' + relativeFilename + ' for ' + error.name);
        }
      }
    }
  } catch (error) {
    return callback(error);
  }

  // run mksnapshot
  var str = dumpObjectToJS(content);
  var version = options.version;
  var arch = options.arch;
  var builddir = options.builddir;
  var snapshotdir = options.snapshotdir;

  if (typeof snapshotdir === 'undefined' || snapshotdir === null) { snapshotdir = path.dirname(dest); }
  var target = path.resolve(snapshotdir, 'snapshot_blob.bin');
  return mksnapshot(str, target, version, arch, builddir, callback);
};

module.exports = createSnapshot;

'use strict'

const fs = require('fs');
const path = require('path');
const mksnapshot = require('mksnapshot');
const vm = require('vm');

let stripBOM = (content) => {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
};

let wrapModuleCode = (script) => {
  script = script.replace(/^\#\!.*/, '');
  return "(function(exports, require, module, __filename, __dirname) { " + script + " \n});";
};

let dumpObjectToJS = (content) => {
  let result = 'var __ATOM_SHELL_SNAPSHOT = {\n';
  for (let filename in content) {
    let func = content[filename].toString();
    result += "  '" + filename + "': " + func + ",\n";
  }
  result += '};\n';
  return result;
};

let createSnapshot = (src, dest, filenames, metadata, options, callback) => {
  let content;
  try {
    src = path.resolve(src);
    content = {};
    for (let i = 0; i < filenames.length; i++) {
      let filename = filenames[i];
      let file = metadata[filename];
      if ((file.type === 'file' || file.type === 'link') && filename.substr(-3) === '.js') {
        let script = wrapModuleCode(stripBOM(fs.readFileSync(filename, 'utf8')));
        let relativeFilename = path.relative(src, filename);
        try {
          let compiled = vm.runInThisContext(script, {
            filename: relativeFilename
          });
          content[relativeFilename] = compiled;
        } catch (error) {
          console.error('Ignoring ' + relativeFilename + ' for ' + error.name);
        }
      }
    }
  } catch (error) {
    callback(error);
    return;
  }
  let str = dumpObjectToJS(content);
  let version = options.version;
  let arch = options.arch;
  let builddir = options.builddir;
  let snapshotdir = options.snapshotdir;
  if (snapshotdir == null) {
    snapshotdir = path.dirname(dest);
  }
  let target = path.resolve(snapshotdir, 'snapshot_blob.bin');
  return mksnapshot(str, target, version, arch, builddir, callback);
};

module.exports = createSnapshot;

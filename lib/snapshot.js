var fs = require('fs');
var path = require('path');
var mksnapshot = require('mksnapshot');
var vm = require('vm');

var stripBOM = function(content) {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
}

var wrapModuleCode = function(script) {
  script = script.replace(/^\#\!.*/, '');
  var wrapped =
    '(function (exports, require, module, __filename, __dirname) { ' +
    script +
    '\n});';
  return wrapped;
};

var dumpObjectToJS = function(content) {
  var result = 'var __ATOM_SHELL_SNAPSHOT = {\n';
  for (var filename in content) {
    result += '  "' + filename + '": ' + content[filename].toString() + ',\n';
  }
  result += '};';
  return result;
}

module.exports = function createSnapshot(src, dest, filenames, metadata, options, callback) {
  try {
    src = path.resolve(src);
    var content = {};
    for (var i in filenames) {
      var filename = filenames[i];
      var file = metadata[filename];
      if ((file.type == 'file' || file.type == 'link') &&
          filename.substr(-3) === '.js') {
        var script = stripBOM(fs.readFileSync(filename, 'utf8'));
        var relativeFilename = path.relative(src, filename);
        var compiledWrapper = vm.runInThisContext(wrapModuleCode(script), {filename: relativeFilename});
        content[relativeFilename] = compiledWrapper;
      }
    }
  } catch (error) {
    if (error) return callback(error);
  }

  // Run mksnapshot.
  var target = path.resolve(dest, '..', 'snapshot.bin');
  var str = dumpObjectToJS(content);
  mksnapshot(str, target, options.version, options.arch, options.builddir, callback);
};

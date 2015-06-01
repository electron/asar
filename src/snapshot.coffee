fs = require 'fs'
path = require 'path'
mksnapshot = require 'mksnapshot'
vm = require 'vm'

stripBOM = (content) ->
  if content.charCodeAt(0) == 0xFEFF
    content = content.slice(1)
  content

wrapModuleCode = (script) ->
  script = script.replace(/^\#\!.*/, '')
  "(function(exports, require, module, __filename, __dirname) { #{script} \n});"

dumpObjectToJS = (content) ->
  result = 'var __ATOM_SHELL_SNAPSHOT = {\n'
  for filename of content
    func = content[filename].toString()
    result += "  '#{filename}': #{func},\n"
  result += '};\n'
  result

createSnapshot = (src, dest, filenames, metadata, options, callback) ->
  try
    src = path.resolve src
    content = {}
    for filename in filenames
      file = metadata[filename]
      if (file.type is 'file' or file.type is 'link') and
         filename.substr(-3) is '.js'
        script = wrapModuleCode stripBOM(fs.readFileSync(filename, 'utf8'))
        relativeFilename = path.relative src, filename
        try
          compiled = vm.runInThisContext script, filename: relativeFilename
          content[relativeFilename] = compiled
        catch error
          console.error 'Ignoring ' + relativeFilename + ' for ' + error.name
  catch error
    return callback(error)

  # run mksnapshot
  str = dumpObjectToJS content
  {version, arch, builddir, snapshotdir} = options
  snapshotdir ?= path.dirname dest
  target = path.resolve snapshotdir, 'snapshot_blob.bin'
  mksnapshot str, target, version, arch, builddir, callback

module.exports = createSnapshot

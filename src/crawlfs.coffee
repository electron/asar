fs = require 'fs'
glob = require 'glob'

module.exports = (dir, options, callback) ->
  metadata = {}
  glob dir + '/**/*', options, (error, filenames) ->
    return callback(error) if error
    for filename in filenames
      stat = fs.lstatSync filename
      if stat.isFile()
        metadata[filename] = type: 'file', stat: stat
      else if stat.isDirectory()
        metadata[filename] = type: 'directory', stat: stat
      else if stat.isSymbolicLink()
        metadata[filename] = type: 'link', stat: stat
    callback null, filenames, metadata

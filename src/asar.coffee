fs = require 'fs'
path = require 'path'
os = require 'os'
minimatch = require 'minimatch'
mkdirp = require 'mkdirp'

Filesystem = require './filesystem'
disk = require './disk'
crawlFilesystem = require './crawlfs'
createSnapshot = require './snapshot'

module.exports.createPackage = (src, dest, callback) ->
  module.exports.createPackageWithOptions src, dest, {}, callback

module.exports.createPackageWithOptions = (src, dest, options, callback) ->
  {dot} = options

  crawlFilesystem src, { dot: dot }, (error, filenames, metadata) ->
    return callback(error) if error
    filesystem = new Filesystem(src)
    files = []
    for filename in filenames
      file = metadata[filename]
      switch file.type
        when 'directory'
          filesystem.insertDirectory filename
        when 'file'
          shouldUnpack =
            if options.unpack
              minimatch(filename, options.unpack, matchBase: true)
            else
              false
          files.push filename: filename, unpack: shouldUnpack
          filesystem.insertFile filename, shouldUnpack, file.stat
        when 'link'
          filesystem.insertLink filename, file.stat

    mkdirp path.dirname(dest), (error) ->
      return callback(error) if error
      disk.writeFilesystem dest, filesystem, files, (error) ->
        return callback(error) if error
        if options.snapshot
          createSnapshot src, dest, filenames, metadata, options, callback
        else
          callback null

module.exports.statFile = (archive, filename, followLinks) ->
  filesystem = disk.readFilesystemSync archive
  filesystem.getFile filename, followLinks

module.exports.listPackage = (archive) ->
  disk.readFilesystemSync(archive).listFiles()

module.exports.extractFile = (archive, filename) ->
  filesystem = disk.readFilesystemSync archive
  disk.readFileSync filesystem, filename, filesystem.getFile(filename)

module.exports.extractAll = (archive, dest) ->
  filesystem = disk.readFilesystemSync archive
  filenames = filesystem.listFiles()

  # under windows just extract links as regular files
  followLinks = process.platform is 'win32'

  # create destination directory
  mkdirp.sync dest

  for filename in filenames
    filename = filename.substr 1  # get rid of leading slash
    destFilename = path.join dest, filename
    file = filesystem.getFile filename, followLinks
    if file.files
      # it's a directory, create it and continue with the next entry
      mkdirp.sync destFilename
    else if file.link
      # it's a symlink, create a symlink
      linkSrcPath = path.dirname path.join(dest, file.link)
      linkDestPath = path.dirname destFilename
      relativePath = path.relative linkDestPath, linkSrcPath
      # try to delete output file, because we can't overwrite a link
      try
        fs.unlinkSync destFilename
      catch error
      linkTo = path.join relativePath, path.basename(file.link)
      fs.symlinkSync linkTo, destFilename
    else
      # it's a file, extract it
      content = disk.readFileSync filesystem, filename, file
      fs.writeFileSync destFilename, content

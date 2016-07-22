fs = require 'fs'
path = require 'path'
tmp = require 'tmp'
UINT64 = require('cuint').UINT64

class Filesystem
  constructor: (src) ->
    @src = path.resolve src
    @header = files: {}
    @offset = UINT64(0)

  searchNodeFromDirectory: (p) ->
    json = @header
    dirs = p.split path.sep
    json = json.files[dir] for dir in dirs when dir isnt '.'
    json

  searchNodeFromPath: (p) ->
    p = path.relative @src, p
    return @header if not p
    name = path.basename p
    node = @searchNodeFromDirectory path.dirname p
    node.files ?= {}
    node.files[name] ?= {}
    node.files[name]

  insertDirectory: (p, shouldUnpack) ->
    node = @searchNodeFromPath p
    node.unpacked = shouldUnpack if shouldUnpack
    node.files = {}

  insertFile: (p, shouldUnpack, file, options, callback) ->
    dirNode = @searchNodeFromPath path.dirname(p)
    node = @searchNodeFromPath p
    if shouldUnpack or dirNode.unpacked
      node.size = file.stat.size
      node.unpacked = true
      process.nextTick(callback)
      return

    handler = =>
      size = if file.transformed then file.transformed.stat.size else file.stat.size

      # JavaScript can not precisely present integers >= UINT32_MAX.
      if size > 4294967295
        throw new Error("#{p}: file size can not be larger than 4.2GB")

      node.size = size
      node.offset = this.offset.toString()
      if process.platform isnt 'win32' and file.stat.mode & 0o100
        node.executable = true
      this.offset.add UINT64(size)

      callback()

    tr = options.transform && options.transform(p)
    if tr
      tmp.file (err, path) ->
        return handler() if err
        out = fs.createWriteStream(path)
        stream = fs.createReadStream p

        stream.pipe(tr).pipe(out)
        tr.on 'end', ->
          file.transformed = {
            path,
            stat: fs.lstatSync path
          }
          handler()
    else
      process.nextTick(handler)

  insertLink: (p, stat) ->
    link = path.relative fs.realpathSync(@src), fs.realpathSync(p)
    if link.substr(0, 2) is '..'
      throw new Error("#{p}: file links out of the package")
    node = @searchNodeFromPath p
    node.link = link

  listFiles: ->
    files = []
    fillFilesFromHeader = (p, json) ->
      if !json.files
        return
      for f of json.files
        fullPath = path.join p, f
        files.push fullPath
        fillFilesFromHeader fullPath, json.files[f]

    fillFilesFromHeader '/', @header
    files

  getNode: (p) ->
    node = @searchNodeFromDirectory path.dirname(p)
    name = path.basename p
    if name
      node.files[name]
    else
      node

  getFile: (p, followLinks=true) ->
    info = @getNode p

    # if followLinks is false we don't resolve symlinks
    if info.link and followLinks
      @getFile info.link
    else
      info

module.exports = Filesystem

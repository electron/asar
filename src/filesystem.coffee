fs = require 'fs'
path = require 'path'
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
    name = path.basename p
    node = @searchNodeFromDirectory(path.dirname(p)).files[name] = {}
    node

  insertDirectory: (p) ->
    node = @searchNodeFromPath p
    node.files = {}

  insertFile: (p, shouldUnpack, stat) ->
    node = @searchNodeFromPath p
    if shouldUnpack
      node.size = stat.size
      node.unpacked = true
      return

    # JavaScript can not precisely present integers >= UINT32_MAX.
    if stat.size > 4294967295
      throw new Error("#{p}: file size can not be larger than 4.2GB")

    node.size = stat.size
    node.offset = @offset.toString()
    if process.platform isnt 'win32' and stat.mode & 0o100
      node.executable = true
    @offset.add UINT64(stat.size)

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

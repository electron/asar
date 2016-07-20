fs = require 'fs'
path = require 'path'
mkdirp = require 'mkdirp'
pickle = require 'chromium-pickle-js'

Filesystem = require './filesystem'
filesystemCache = {}

copyFileToSync = (dest, src, filename) ->
  srcFile = path.join src, filename
  targetFile = path.join dest, filename

  content = fs.readFileSync srcFile
  stats = fs.statSync srcFile
  mkdirp.sync path.dirname(targetFile)
  fs.writeFileSync targetFile, content, mode: stats.mode

writeFileListToStream = (dest, filesystem, out, list, metadata, callback) ->
  if list.length is 0
    out.end()
    return callback null

  file = list[0]
  if file.unpack
    # the file should not be packed into archive.
    filename = path.relative filesystem.src, file.filename
    try
      copyFileToSync "#{dest}.unpacked", filesystem.src, filename
    catch error
      return callback error
    writeFileListToStream dest, filesystem, out, list.slice(1), metadata, callback
  else
    tr = metadata[file.filename].transformed
    stream = fs.createReadStream (if tr then tr.path else file.filename)
    stream.pipe out, end: false
    stream.on 'error', callback
    stream.on 'end', ->
      writeFileListToStream dest, filesystem, out, list.slice(1), metadata, callback

module.exports.writeFilesystem = (dest, filesystem, files, metadata, callback) ->
  try
    headerPickle = pickle.createEmpty()
    headerPickle.writeString JSON.stringify(filesystem.header)
    headerBuf = headerPickle.toBuffer()

    sizePickle = pickle.createEmpty()
    sizePickle.writeUInt32 headerBuf.length
    sizeBuf = sizePickle.toBuffer()
  catch error
    return callback error

  out = fs.createWriteStream(dest)
  out.on 'error', callback
  out.write sizeBuf
  out.write headerBuf, ->
    writeFileListToStream dest, filesystem, out, files, metadata, callback

module.exports.readArchiveHeaderSync = (archive) ->
  fd = fs.openSync archive, 'r'
  try
    sizeBuf = new Buffer(8)
    if fs.readSync(fd, sizeBuf, 0, 8, null) != 8
      throw new Error('Unable to read header size')

    sizePickle = pickle.createFromBuffer(sizeBuf)
    size = sizePickle.createIterator().readUInt32()
    headerBuf = new Buffer(size)
    if fs.readSync(fd, headerBuf, 0, size, null) != size
      throw new Error('Unable to read header')
  finally
    fs.closeSync fd

  headerPickle = pickle.createFromBuffer headerBuf
  header = headerPickle.createIterator().readString()
  header: JSON.parse(header), headerSize: size

module.exports.readFilesystemSync = (archive) ->
  unless filesystemCache[archive]
    header = @readArchiveHeaderSync archive
    filesystem = new Filesystem(archive)
    filesystem.header = header.header
    filesystem.headerSize = header.headerSize
    filesystemCache[archive] = filesystem
  filesystemCache[archive]

module.exports.readFileSync = (filesystem, filename, info) ->
  buffer = new Buffer(info.size)
  return buffer if info.size <= 0
  if info.unpacked
    # it's an unpacked file, copy it.
    buffer = fs.readFileSync path.join("#{filesystem.src}.unpacked", filename)
  else
    # Node throws an exception when reading 0 bytes into a 0-size buffer,
    # so we short-circuit the read in this case.
    fd = fs.openSync filesystem.src, 'r'
    try
      offset = 8 + filesystem.headerSize + parseInt(info.offset)
      fs.readSync fd, buffer, 0, info.size, offset
    finally
      fs.closeSync fd
  buffer

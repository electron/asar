'use strict'

const pify = require('pify')

const fs = pify(process.versions.electron ? require('original-fs') : require('fs'))
const path = require('path')
const mkdirp = pify(require('mkdirp'))
const pickle = require('chromium-pickle-js')

const Filesystem = require('./filesystem')
let filesystemCache = {}

function copyFile (dest, src, filename) {
  const srcFile = path.join(src, filename)
  const targetFile = path.join(dest, filename)

  return Promise.all([fs.readFile(srcFile), fs.stat(srcFile), mkdirp(path.dirname(targetFile))])
    .then(([content, stats, _]) => fs.writeFile(targetFile, content, { mode: stats.mode }))
}

function streamTransformedFile (originalFilename, outStream, transformed) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(transformed ? transformed.path : originalFilename)
    stream.pipe(outStream, { end: false })
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
}

const writeFileListToStream = function (dest, filesystem, out, list, metadata) {
  let promise = Promise.resolve()
  for (const file of list) {
    if (file.unpack) { // the file should not be packed into archive
      const filename = path.relative(filesystem.src, file.filename)
      promise = promise.then(() => copyFile(`${dest}.unpacked`, filesystem.src, filename))
    } else {
      promise = promise.then(() => streamTransformedFile(file.filename, out, metadata[file.filename].transformed))
    }
  }
  return promise.then(() => out.end())
}

module.exports.writeFilesystem = function (dest, filesystem, files, metadata) {
  const headerPickle = pickle.createEmpty()
  headerPickle.writeString(JSON.stringify(filesystem.header))
  const headerBuf = headerPickle.toBuffer()

  const sizePickle = pickle.createEmpty()
  sizePickle.writeUInt32(headerBuf.length)
  const sizeBuf = sizePickle.toBuffer()

  const out = fs.createWriteStream(dest)
  return new Promise((resolve, reject) => {
    out.on('error', reject)
    out.write(sizeBuf)
    return out.write(headerBuf, () => resolve())
  }).then(() => writeFileListToStream(dest, filesystem, out, files, metadata))
}

module.exports.readArchiveHeaderSync = function (archive) {
  const fd = fs.openSync(archive, 'r')
  let size
  let headerBuf
  try {
    const sizeBuf = Buffer.alloc(8)
    if (fs.readSync(fd, sizeBuf, 0, 8, null) !== 8) {
      throw new Error('Unable to read header size')
    }

    const sizePickle = pickle.createFromBuffer(sizeBuf)
    size = sizePickle.createIterator().readUInt32()
    headerBuf = Buffer.alloc(size)
    if (fs.readSync(fd, headerBuf, 0, size, null) !== size) {
      throw new Error('Unable to read header')
    }
  } finally {
    fs.closeSync(fd)
  }

  const headerPickle = pickle.createFromBuffer(headerBuf)
  const header = headerPickle.createIterator().readString()
  return { header: JSON.parse(header), headerSize: size }
}

module.exports.readFilesystemSync = function (archive) {
  if (!filesystemCache[archive]) {
    const header = this.readArchiveHeaderSync(archive)
    const filesystem = new Filesystem(archive)
    filesystem.header = header.header
    filesystem.headerSize = header.headerSize
    filesystemCache[archive] = filesystem
  }
  return filesystemCache[archive]
}

module.exports.uncacheFilesystem = function (archive) {
  if (filesystemCache[archive]) {
    filesystemCache[archive] = undefined
    return true
  }
  return false
}

module.exports.uncacheAll = function () {
  filesystemCache = {}
}

module.exports.readFileSync = function (filesystem, filename, info) {
  let buffer = Buffer.alloc(info.size)
  if (info.size <= 0) { return buffer }
  if (info.unpacked) {
    // it's an unpacked file, copy it.
    buffer = fs.readFileSync(path.join(`${filesystem.src}.unpacked`, filename))
  } else {
    // Node throws an exception when reading 0 bytes into a 0-size buffer,
    // so we short-circuit the read in this case.
    const fd = fs.openSync(filesystem.src, 'r')
    try {
      const offset = 8 + filesystem.headerSize + parseInt(info.offset)
      fs.readSync(fd, buffer, 0, info.size, offset)
    } finally {
      fs.closeSync(fd)
    }
  }
  return buffer
}

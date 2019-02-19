'use strict'

const pify = require('pify')

const fs = process.versions.electron ? require('original-fs') : require('fs')
const path = require('path')
const minimatch = require('minimatch')
const mkdirp = pify(require('mkdirp'))

const Filesystem = require('./filesystem')
const disk = require('./disk')
const crawlFilesystem = require('./crawlfs')

/**
 * Whether a directory should be excluded from packing due to the `--unpack-dir" option.
 *
 * @param {string} dirPath - directory path to check
 * @param {string} pattern - literal prefix [for backward compatibility] or glob pattern
 * @param {array} unpackDirs - Array of directory paths previously marked as unpacked
 */
function isUnpackedDir (dirPath, pattern, unpackDirs) {
  if (dirPath.startsWith(pattern) || minimatch(dirPath, pattern)) {
    if (!unpackDirs.includes(dirPath)) {
      unpackDirs.push(dirPath)
    }
    return true
  } else {
    return unpackDirs.some(unpackDir => dirPath.startsWith(unpackDir))
  }
}

module.exports.createPackage = function (src, dest) {
  return module.exports.createPackageWithOptions(src, dest, {})
}

module.exports.createPackageWithOptions = function (src, dest, options) {
  const globOptions = options.globOptions ? options.globOptions : {}
  globOptions.dot = options.dot === undefined ? true : options.dot

  let pattern = src + '/**/*'
  if (options.pattern) {
    pattern = src + options.pattern
  }

  return crawlFilesystem(pattern, globOptions)
    .then(([filenames, metadata]) => module.exports.createPackageFromFiles(src, dest, filenames, metadata, options))
}

/*
createPackageFromFiles - Create an asar-archive from a list of filenames
src: Base path. All files are relative to this.
dest: Archive filename (& path).
filenames: Array of filenames relative to src.
metadata: Object with filenames as keys and {type='directory|file|link', stat: fs.stat} as values. (Optional)
options: The options.
*/
module.exports.createPackageFromFiles = function (src, dest, filenames, metadata, options) {
  if (typeof metadata === 'undefined' || metadata === null) { metadata = {} }
  if (typeof options === 'undefined' || options === null) { options = {} }

  src = path.normalize(src)
  dest = path.normalize(dest)
  filenames = filenames.map(function (filename) { return path.normalize(filename) })

  const filesystem = new Filesystem(src)
  const files = []
  const unpackDirs = []

  let filenamesSorted = []
  if (options.ordering) {
    const orderingFiles = fs.readFileSync(options.ordering).toString().split('\n').map(function (line) {
      if (line.includes(':')) { line = line.split(':').pop() }
      line = line.trim()
      if (line.startsWith('/')) { line = line.slice(1) }
      return line
    })

    const ordering = []
    for (const file of orderingFiles) {
      const pathComponents = file.split(path.sep)
      let str = src
      for (const pathComponent of pathComponents) {
        str = path.join(str, pathComponent)
        ordering.push(str)
      }
    }

    let missing = 0
    const total = filenames.length

    for (const file of ordering) {
      if (!filenamesSorted.includes(file) && filenames.includes(file)) {
        filenamesSorted.push(file)
      }
    }

    for (const file of filenames) {
      if (!filenamesSorted.includes(file)) {
        filenamesSorted.push(file)
        missing += 1
      }
    }

    console.log(`Ordering file has ${((total - missing) / total) * 100}% coverage.`)
  } else {
    filenamesSorted = filenames
  }

  const handleFile = function (filename) {
    let file = metadata[filename]
    let type
    if (!file) {
      const stat = fs.lstatSync(filename)
      if (stat.isDirectory()) { type = 'directory' }
      if (stat.isFile()) { type = 'file' }
      if (stat.isSymbolicLink()) { type = 'link' }
      file = { stat, type }
      metadata[filename] = file
    }

    let shouldUnpack
    switch (file.type) {
      case 'directory':
        if (options.unpackDir) {
          shouldUnpack = isUnpackedDir(path.relative(src, filename), options.unpackDir, unpackDirs)
        } else {
          shouldUnpack = false
        }
        filesystem.insertDirectory(filename, shouldUnpack)
        break
      case 'file':
        shouldUnpack = false
        if (options.unpack) {
          shouldUnpack = minimatch(filename, options.unpack, { matchBase: true })
        }
        if (!shouldUnpack && options.unpackDir) {
          const dirName = path.relative(src, path.dirname(filename))
          shouldUnpack = isUnpackedDir(dirName, options.unpackDir, unpackDirs)
        }
        files.push({ filename: filename, unpack: shouldUnpack })
        return filesystem.insertFile(filename, shouldUnpack, file, options)
      case 'link':
        filesystem.insertLink(filename, file.stat)
        break
    }
    return Promise.resolve()
  }

  const insertsDone = function () {
    return mkdirp(path.dirname(dest))
      .then(() => disk.writeFilesystem(dest, filesystem, files, metadata))
  }

  const names = filenamesSorted.slice()

  const next = function (name) {
    if (!name) { return insertsDone() }

    return handleFile(name)
      .then(() => next(names.shift()))
  }

  return next(names.shift())
}

module.exports.statFile = function (archive, filename, followLinks) {
  const filesystem = disk.readFilesystemSync(archive)
  return filesystem.getFile(filename, followLinks)
}

module.exports.listPackage = function (archive, options) {
  return disk.readFilesystemSync(archive).listFiles(options)
}

module.exports.extractFile = function (archive, filename) {
  const filesystem = disk.readFilesystemSync(archive)
  return disk.readFileSync(filesystem, filename, filesystem.getFile(filename))
}

module.exports.extractAll = function (archive, dest) {
  const filesystem = disk.readFilesystemSync(archive)
  const filenames = filesystem.listFiles()

  // under windows just extract links as regular files
  const followLinks = process.platform === 'win32'

  // create destination directory
  mkdirp.sync(dest)

  return filenames.map((filename) => {
    filename = filename.substr(1) // get rid of leading slash
    const destFilename = path.join(dest, filename)
    const file = filesystem.getFile(filename, followLinks)
    if (file.files) {
      // it's a directory, create it and continue with the next entry
      mkdirp.sync(destFilename)
    } else if (file.link) {
      // it's a symlink, create a symlink
      const linkSrcPath = path.dirname(path.join(dest, file.link))
      const linkDestPath = path.dirname(destFilename)
      const relativePath = path.relative(linkDestPath, linkSrcPath);
      // try to delete output file, because we can't overwrite a link
      (() => {
        try {
          fs.unlinkSync(destFilename)
        } catch (error) {}
      })()
      const linkTo = path.join(relativePath, path.basename(file.link))
      fs.symlinkSync(linkTo, destFilename)
    } else {
      // it's a file, extract it
      const content = disk.readFileSync(filesystem, filename, file)
      fs.writeFileSync(destFilename, content)
    }
  })
}

module.exports.uncache = function (archive) {
  return disk.uncacheFilesystem(archive)
}

module.exports.uncacheAll = function () {
  disk.uncacheAll()
}

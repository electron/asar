'use strict'

const fs = require('./wrapped-fs')
const path = require('path')
const minimatch = require('minimatch')

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

module.exports.createPackage = async function (src, dest) {
  return module.exports.createPackageWithOptions(src, dest, {})
}

module.exports.createPackageWithOptions = async function (src, dest, options) {
  const globOptions = options.globOptions ? options.globOptions : {}
  globOptions.dot = options.dot === undefined ? true : options.dot

  const pattern = src + (options.pattern ? options.pattern : '/**/*')

  const [filenames, metadata] = await crawlFilesystem(pattern, globOptions)
  return module.exports.createPackageFromFiles(src, dest, filenames, metadata, options)
}

/**
 * Create an ASAR archive from a list of filenames.
 *
 * @param {string} src: Base path. All files are relative to this.
 * @param {string} dest: Archive filename (& path).
 * @param {array} filenames: List of filenames relative to src.
 * @param {object} metadata: Object with filenames as keys and {type='directory|file|link', stat: fs.stat} as values. (Optional)
 * @param {object} options: Options passed to `createPackageWithOptions`.
*/
module.exports.createPackageFromFiles = async function (src, dest, filenames, metadata, options) {
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
    const orderingFiles = (await fs.readFile(options.ordering)).toString().split('\n').map(line => {
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

  const handleFile = async function (filename) {
    if (!metadata[filename]) {
      metadata[filename] = await crawlFilesystem.determineFileType(filename)
    }
    const file = metadata[filename]

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
        filesystem.insertLink(filename)
        break
    }
    return Promise.resolve()
  }

  const insertsDone = async function () {
    await fs.mkdirp(path.dirname(dest))
    return disk.writeFilesystem(dest, filesystem, files, metadata)
  }

  const names = filenamesSorted.slice()

  const next = async function (name) {
    if (!name) { return insertsDone() }

    await handleFile(name)
    return next(names.shift())
  }

  return next(names.shift())
}

module.exports.statFile = function (archive, filename, followLinks) {
  const filesystem = disk.readFilesystemSync(archive)
  return filesystem.getFile(filename, followLinks)
}

module.exports.getRawHeader = function (archive) {
  return disk.readArchiveHeaderSync(archive)
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
  fs.mkdirpSync(dest)

  for (const fullPath of filenames) {
    // Remove leading slash
    const filename = fullPath.substr(1)
    const destFilename = path.join(dest, filename)
    const file = filesystem.getFile(filename, followLinks)
    if (file.files) {
      // it's a directory, create it and continue with the next entry
      fs.mkdirpSync(destFilename)
    } else if (file.link) {
      // it's a symlink, create a symlink
      const linkSrcPath = path.dirname(path.join(dest, file.link))
      const linkDestPath = path.dirname(destFilename)
      const relativePath = path.relative(linkDestPath, linkSrcPath)
      // try to delete output file, because we can't overwrite a link
      try {
        fs.unlinkSync(destFilename)
      } catch {}
      const linkTo = path.join(relativePath, path.basename(file.link))
      fs.symlinkSync(linkTo, destFilename)
    } else {
      // it's a file, extract it
      const content = disk.readFileSync(filesystem, filename, file)
      fs.writeFileSync(destFilename, content)
      if (file.executable) {
        fs.chmodSync(destFilename, '755')
      }
    }
  }
}

module.exports.uncache = function (archive) {
  return disk.uncacheFilesystem(archive)
}

module.exports.uncacheAll = function () {
  disk.uncacheAll()
}

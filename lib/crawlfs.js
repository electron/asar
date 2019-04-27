'use strict'

const { promisify } = require('util')

const fs = require('./wrapped-fs')
const glob = promisify(require('glob'))

async function determineFileType (filename) {
  const stat = await fs.lstat(filename)
  if (stat.isFile()) {
    return { type: 'file', stat }
  } else if (stat.isDirectory()) {
    return { type: 'directory', stat }
  } else if (stat.isSymbolicLink()) {
    return { type: 'link', stat }
  }
}

module.exports = async function (dir, options) {
  const metadata = {}
  const crawled = await glob(dir, options)
  const results = await Promise.all(crawled.map(async filename => [filename, await determineFileType(filename)]))
  const filenames = results.map(([filename, type]) => {
    if (type) {
      metadata[filename] = type
    }
    return filename
  })
  return [filenames, metadata]
}
module.exports.determineFileType = determineFileType

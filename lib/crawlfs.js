'use strict'

const { promisify } = require('util')

const fs = require('./wrapped-fs')
const glob = promisify(require('glob'))

async function determineFileType (filename) {
  const stat = await fs.lstat(filename)
  if (stat.isFile()) {
    return [filename, { type: 'file', stat: stat }]
  } else if (stat.isDirectory()) {
    return [filename, { type: 'directory', stat: stat }]
  } else if (stat.isSymbolicLink()) {
    return [filename, { type: 'link', stat: stat }]
  }

  return [filename, undefined]
}

module.exports = async function (dir, options) {
  const metadata = {}
  const crawled = await glob(dir, options)
  const results = await Promise.all(crawled.map(filename => determineFileType(filename)))
  const filenames = results.map(([filename, type]) => {
    if (type) {
      metadata[filename] = type
    }
    return filename
  })
  return [filenames, metadata]
}

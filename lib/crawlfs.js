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
  const links = []
  const filenames = results.map(([filename, type]) => {
    if (type) {
      metadata[filename] = type
      if (type.type === 'link') links.push(filename)
    }
    return filename
  }).filter((filename) => {
    // Newer glob can return files inside symlinked directories, to avoid
    // those appearing in archives we need to manually exclude theme here
    const exactLinkIndex = links.findIndex(link => filename === link)
    return links.every((link, index) => {
      if (index === exactLinkIndex) return true
      return !filename.startsWith(link)
    })
  })
  return [filenames, metadata]
}
module.exports.determineFileType = determineFileType

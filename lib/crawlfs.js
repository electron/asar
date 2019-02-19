'use strict'

const pify = require('pify')

const fs = process.versions.electron ? require('original-fs') : require('fs')
const glob = pify(require('glob'))

module.exports = function (dir, options) {
  const metadata = {}
  return glob(dir, options)
    .then(filenames => {
      for (const filename of filenames) {
        const stat = fs.lstatSync(filename)
        if (stat.isFile()) {
          metadata[filename] = { type: 'file', stat: stat }
        } else if (stat.isDirectory()) {
          metadata[filename] = { type: 'directory', stat: stat }
        } else if (stat.isSymbolicLink()) {
          metadata[filename] = { type: 'link', stat: stat }
        }
      }
      return [filenames, metadata]
    })
}

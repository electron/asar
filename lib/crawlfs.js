'use strict'

const { promisify } = require('util')

const fs = promisify(process.versions.electron ? require('original-fs') : require('fs'))
const glob = promisify(require('glob'))

function determineFileType (filename) {
  return fs.lstat(filename)
    .then(stat => {
      if (stat.isFile()) {
        return [filename, { type: 'file', stat: stat }]
      } else if (stat.isDirectory()) {
        return [filename, { type: 'directory', stat: stat }]
      } else if (stat.isSymbolicLink()) {
        return [filename, { type: 'link', stat: stat }]
      }

      return [filename, undefined]
    })
}

module.exports = function (dir, options) {
  const metadata = {}
  return glob(dir, options)
    .then(filenames => Promise.all(filenames.map(filename => determineFileType(filename))))
    .then(results => {
      const filenames = []
      for (const [filename, type] of results) {
        filenames.push(filename)
        if (type) {
          metadata[filename] = type
        }
      }
      return [filenames, metadata]
    })
}

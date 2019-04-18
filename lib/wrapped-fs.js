'use strict'

const { promisify } = require('util')

const fs = process.versions.electron ? require('original-fs') : require('fs')
const mkdirp = require('mkdirp')

const methods = [
  'lstat',
  'readFile',
  'stat',
  'writeFile'
]

for (const method of methods) {
  fs[method] = promisify(fs[method])
}
// To make it more like fs-extra
fs.mkdirp = promisify(mkdirp)
fs.mkdirpSync = mkdirp.sync

module.exports = fs

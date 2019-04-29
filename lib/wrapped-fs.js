'use strict'

const { promisify } = require('util')

const fs = process.versions.electron ? require('original-fs') : require('fs')
const mkdirp = require('mkdirp')

const promisifiedMethods = [
  'lstat',
  'readFile',
  'stat',
  'writeFile'
]

const promisified = {}

for (const method of Object.keys(fs)) {
  if (promisifiedMethods.includes(method)) {
    promisified[method] = promisify(fs[method])
  } else {
    promisified[method] = fs[method]
  }
}
// To make it more like fs-extra
promisified.mkdirp = promisify(mkdirp)
promisified.mkdirpSync = mkdirp.sync

module.exports = promisified

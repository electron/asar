'use strict'

const pify = require('pify')

const assert = require('assert')
const fs = pify(process.versions.electron ? require('original-fs') : require('fs'))

module.exports = function (actualFilePath, expectedFilePath) {
  return Promise.all([fs.readFile(actualFilePath, 'utf8'), fs.readFile(expectedFilePath, 'utf8')])
    .then(([actual, expected]) => assert.strictEqual(actual, expected))
}

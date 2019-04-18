'use strict'

const { promisify } = require('util')

const assert = require('assert')
const fs = promisify(process.versions.electron ? require('original-fs') : require('fs'))

module.exports = function (actualFilePath, expectedFilePath) {
  return Promise.all([fs.readFile(actualFilePath, 'utf8'), fs.readFile(expectedFilePath, 'utf8')])
    .then(([actual, expected]) => assert.strictEqual(actual, expected))
}

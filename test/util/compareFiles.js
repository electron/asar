'use strict'

const assert = require('assert')
const fs = require('../../lib/wrapped-fs')

module.exports = async function (actualFilePath, expectedFilePath) {
  const [actual, expected] = await Promise.all([fs.readFile(actualFilePath, 'utf8'), fs.readFile(expectedFilePath, 'utf8')])
  assert.strictEqual(actual, expected)
}

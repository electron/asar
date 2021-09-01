'use strict'

const assert = require('assert')
const fs = require('../../lib/wrapped-fs')

module.exports = async function (actualFilePath, expectedFilePath) {
  if (process.env.ELECTRON_ASAR_SPEC_UPDATE) {
    await fs.writeFile(expectedFilePath, await fs.readFile(actualFilePath))
  }
  const [actual, expected] = await Promise.all([fs.readFile(actualFilePath, 'utf8'), fs.readFile(expectedFilePath, 'utf8')])
  assert.strictEqual(actual, expected)
}

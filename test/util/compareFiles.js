'use strict'
const assert = require('assert')
const fs = require('fs')

module.exports = function (filepathA, filepathB) {
  const actual = fs.readFileSync(filepathA, 'utf8')
  const expected = fs.readFileSync(filepathB, 'utf8')
  return assert.equal(actual, expected)
}

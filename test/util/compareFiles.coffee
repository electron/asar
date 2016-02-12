assert = require 'assert'
fs = require 'fs'

module.exports = (filepathA, filepathB) ->
  actual = fs.readFileSync filepathA, 'utf8'
  expected = fs.readFileSync filepathB, 'utf8'
  return assert.equal actual, expected
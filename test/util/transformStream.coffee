{ Transform } = require 'stream'
{ basename } = require 'path'

class Reverser extends Transform
  constructor: ->
    super()
    @_data = ''

  _transform: (buf, enc, cb) ->
    @_data += buf
    cb()

  _flush: (cb) ->
    txt = @_data.toString().split('').reverse().join('')
    @push(txt)
    cb()

module.exports = (filename) ->
  if basename(filename) is 'file0.txt'
    return new Reverser()

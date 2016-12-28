'use strict'
const Transform = require('stream').Transform
const basename = require('path').basename

class Reverser extends Transform {
  constructor () {
    super()
    this._data = ''
  }

  _transform (buf, enc, cb) {
    this._data += buf
    return cb()
  }

  _flush (cb) {
    const txt = this._data.toString().split('').reverse().join('')
    this.push(txt)
    return cb()
  }
}

module.exports = function (filename) {
  if (basename(filename) === 'file0.txt') {
    return new Reverser()
  }
}

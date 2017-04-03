'use strict'
const Transform = require('stream').Transform
const basename = require('path').basename

class BaseTransform extends Transform {
  constructor () {
    super()
    this._data = ''
  }

  _transform (buf, enc, cb) {
    this._data += buf
    return cb()
  }
}

class Reverser extends BaseTransform {
  _flush (cb) {
    const txt = this._data.toString().split('').reverse().join('')
    this.push(txt)
    return cb()
  }
}

class ZeroPad extends BaseTransform {
  _flush (cb) {
    const txt = '00000000' + this._data.toString()
    this.push(txt)
    return cb()
  }
}

module.exports = {
  reverser: function (filename) {
    if (basename(filename) === 'file0.txt') {
      return new Reverser()
    }
  },

  zeroPad: function (filename) {
    if (basename(filename) === 'file0.txt') {
      return new ZeroPad()
    }
  }
}

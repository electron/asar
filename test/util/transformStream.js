var { Transform } = require('stream');
var { basename } = require('path');

class Reverser extends Transform {
  constructor() {
    super();
    this._data = '';
  }

  _transform(buf, enc, cb) {
    this._data += buf;
    return cb();
  }

  _flush(cb) {
    var txt = this._data.toString().split('').reverse().join('');
    this.push(txt);
    return cb();
  }
}

module.exports = function(filename) {
  if (basename(filename) === 'file0.txt') {
    return new Reverser();
  }
};

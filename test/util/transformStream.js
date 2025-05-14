import { Transform } from 'node:stream';
import { basename } from 'node:path';

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
    const txt = this._data.toString().split('').reverse().join('');
    this.push(txt);
    return cb();
  }
}

export function transformStream(filename) {
  if (basename(filename) === 'file0.txt') {
    return new Reverser();
  }
}

import { Transform, TransformCallback } from 'stream';
import { basename } from 'path';

class Reverser extends Transform {
  private _data: string;

  constructor() {
    super();
    this._data = '';
  }

  _transform(chunk: any, _encoding: string, cb: TransformCallback) {
    this._data += chunk;
    return cb();
  }

  _flush(cb: TransformCallback) {
    const txt = this._data.toString().split('').reverse().join('');
    this.push(txt);
    return cb();
  }
}

export default function (filename: string) {
  if (basename(filename) === 'file0.txt') {
    return new Reverser();
  }
}

import { basename } from 'path';
import { Transform } from 'stream';

class Reverser extends Transform {
  private _data: string;
  constructor() {
    super();
    this._data = '';
  }

  _transform(buf: Buffer, enc: string, cb: () => any) {
    this._data += buf;
    return cb();
  }

  _flush(cb: () => any) {
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

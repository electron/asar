import { Transform } from 'node:stream';
import { basename } from 'node:path';

class Reverser extends Transform {
  private _data: string = '';

  constructor() {
    super();
  }

  _transform(buf: Buffer, enc: BufferEncoding, cb: (error?: Error | null) => void) {
    this._data += buf;
    return cb();
  }

  _flush(cb: (error?: Error | null) => void) {
    const txt = this._data.toString().split('').reverse().join('');
    this.push(txt);
    return cb();
  }
}

export function transformStream(filename: string) {
  if (basename(filename) === 'file0.txt') {
    return new Reverser();
  }
}

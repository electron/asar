import assert from 'node:assert';
import { Pickle } from '../lib/pickle.js';

describe('Pickle', function () {
  it('supports multi-byte characters', function () {
    const write = Pickle.createEmpty();
    write.writeString('女の子.txt');

    const read = Pickle.createFromBuffer(write.toBuffer());
    assert.strictEqual(read.createIterator().readString(), '女の子.txt');
  });
});

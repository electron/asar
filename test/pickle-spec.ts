import { describe, it, expect } from 'vitest';
import { Pickle } from '../lib/pickle.js';

describe('Pickle', () => {
  it('supports multi-byte characters', () => {
    const write = Pickle.createEmpty();
    write.writeString('女の子.txt');

    const read = Pickle.createFromBuffer(write.toBuffer());
    expect(read.createIterator().readString()).toBe('女の子.txt');
  });
});

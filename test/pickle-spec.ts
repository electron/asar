import { describe, it, expect } from 'vitest';
import { Pickle } from '../src/pickle.js';

describe('Pickle', () => {
  it('supports multi-byte characters', () => {
    const write = Pickle.createEmpty();
    write.writeString('女の子.txt');

    const read = Pickle.createFromBuffer(write.toBuffer());
    expect(read.createIterator().readString()).toBe('女の子.txt');
  });

  it('should roundtrip all integer types', () => {
    const p = Pickle.createEmpty();
    p.writeInt(-42);
    p.writeUInt32(42);
    p.writeInt64(123456789);
    p.writeUInt64(987654321);

    const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
    expect(iter.readInt()).toBe(-42);
    expect(iter.readUInt32()).toBe(42);
    expect(iter.readInt64()).toBe(BigInt(123456789));
    expect(iter.readUInt64()).toBe(BigInt(987654321));
  });

  it('should roundtrip float and double', () => {
    const p = Pickle.createEmpty();
    p.writeFloat(3.14);
    p.writeDouble(2.718281828459045);

    const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
    expect(iter.readFloat()).toBeCloseTo(3.14, 2);
    expect(iter.readDouble()).toBeCloseTo(2.718281828459045, 10);
  });

  it('should roundtrip boolean values', () => {
    const p = Pickle.createEmpty();
    p.writeBool(true);
    p.writeBool(false);

    const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
    expect(iter.readBool()).toBe(true);
    expect(iter.readBool()).toBe(false);
  });

  it('should roundtrip empty string', () => {
    const p = Pickle.createEmpty();
    p.writeString('');
    const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
    expect(iter.readString()).toBe('');
  });

  it('should roundtrip very long string', () => {
    const longStr = 'x'.repeat(100000);
    const p = Pickle.createEmpty();
    p.writeString(longStr);
    const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
    expect(iter.readString()).toBe(longStr);
  });

  it('should throw when reading past end of pickle', () => {
    const p = Pickle.createEmpty();
    p.writeInt(1);
    const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
    iter.readInt(); // consume the one value
    expect(() => iter.readInt()).toThrow(/Failed to read data/);
  });

  it('should handle multiple resizes for large payloads', () => {
    const p = Pickle.createEmpty();
    // Write enough data to trigger multiple resizes (initial capacity is 64 bytes)
    for (let i = 0; i < 100; i++) {
      p.writeString(`string-${i}-${'x'.repeat(50)}`);
    }
    const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
    for (let i = 0; i < 100; i++) {
      expect(iter.readString()).toBe(`string-${i}-${'x'.repeat(50)}`);
    }
  });

  it('should handle mixed types in sequence', () => {
    const p = Pickle.createEmpty();
    p.writeInt(1);
    p.writeString('hello');
    p.writeBool(true);
    p.writeDouble(99.9);
    p.writeUInt32(0xffffffff);
    p.writeString('世界');

    const iter = Pickle.createFromBuffer(p.toBuffer()).createIterator();
    expect(iter.readInt()).toBe(1);
    expect(iter.readString()).toBe('hello');
    expect(iter.readBool()).toBe(true);
    expect(iter.readDouble()).toBeCloseTo(99.9);
    expect(iter.readUInt32()).toBe(0xffffffff);
    expect(iter.readString()).toBe('世界');
  });

  it('should throw on zero-length buffer in createFromBuffer', () => {
    const buf = Buffer.alloc(0);
    expect(() => Pickle.createFromBuffer(buf)).toThrow();
  });
});

import { encodeBitmask } from './bitmask.js';

const textDecoder = new TextDecoder();

export function readString(dv: DataView, offset: number) {
  const _offset = dv.getInt32(offset, true);
  const _length = dv.getInt32(offset + 4, true);
  return textDecoder.decode(new Uint8Array(dv.buffer, _offset, _length));
}

export function createStringWriter(startOffset = 0) {
  const textEncoder = new TextEncoder();
  let buffer = new Uint8Array(0);
  let offset = 0;

  return {
    write(str: string) {
      const encoded = textEncoder.encode(str);
      const requiredLength = offset + encoded.length;
      if (buffer.length < requiredLength) {
        const newBuffer = new Uint8Array(requiredLength * 2);
        newBuffer.set(buffer);
        buffer = newBuffer;
      }
      buffer.set(encoded, offset);
      const output: [number, number] = [startOffset + offset, encoded.length];
      offset += encoded.length;
      return output;
    },
    export() {
      return buffer.slice(0, offset);
    }
  };
}

export type StringWriter = ReturnType<typeof createStringWriter>;

export function createBitmaskWriter(startOffset = 0) {
  let buffer = new Uint8Array(0);
  let offset = 0;

  return {
    write(bitmask: Iterable<number>, maxIndex: number, noOfClass = 1) {
      const n = maxIndex * noOfClass + noOfClass - 1;
      const encoded = encodeBitmask(bitmask, n);
      const requiredLength = offset + encoded.length;
      if (buffer.length < requiredLength) {
        const newBuffer = new Uint8Array(requiredLength * 2);
        newBuffer.set(buffer);
        buffer = newBuffer;
      }
      buffer.set(encoded, offset);
      const output: [number, number] = [startOffset + offset, encoded.length];
      offset += encoded.length;
      return output;
    },
    export() {
      return buffer.slice(0, offset);
    }
  };
}

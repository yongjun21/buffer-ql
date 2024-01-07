import { encodeBitmask } from './bitmask.js';

const textDecoder = new TextDecoder();

export function readVarint(dv: DataView, offset: number) {
  let _offset = dv.getInt32(offset, true)
  let value = 0;
  let shift = 0;
  let byte;
  do {
    byte = dv.getUint8(_offset++);
    value |= (byte & 127) << shift;
    shift += 7;
  } while (byte & 128);
  return [value, _offset];
}

export function readString(dv: DataView, offset: number) {
  const [_length, _offset] = readVarint(dv, offset);
  return textDecoder.decode(new Uint8Array(dv.buffer, _offset, _length));
}

export function createStringWriter(startOffset = 0) {
  const textEncoder = new TextEncoder();
  let buffer = new Uint8Array(0);
  let offset = 0;

  return {
    write(str: string) {
      const encoded = textEncoder.encode(str);
      const lengthVarint = encodeVarint(encoded.length);
      const nextOffset = offset + lengthVarint.length + encoded.length;
      if (buffer.length < nextOffset) {
        const newBuffer = new Uint8Array(nextOffset * 2);
        newBuffer.set(buffer);
        buffer = newBuffer;
      }
      buffer.set(lengthVarint, offset);
      buffer.set(encoded, offset + lengthVarint.length);
      const output = startOffset + offset;
      offset = nextOffset;
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
    write(bitmask: Iterable<number>, maxIndex: number, noOfClasses = 1) {
      const n = maxIndex * noOfClasses + noOfClasses - 1;
      const encoded = encodeBitmask(bitmask, n);
      const lengthVarint = encodeVarint(encoded.length);
      const nextOffset = offset + lengthVarint.length + encoded.length;
      if (buffer.length < nextOffset) {
        const newBuffer = new Uint8Array(nextOffset * 2);
        newBuffer.set(buffer);
        buffer = newBuffer;
      }
      buffer.set(lengthVarint, offset);                                                                                    
      buffer.set(encoded, offset + lengthVarint.length);
      const output = startOffset + offset;
      offset = nextOffset;
      return output;
    },
    export() {
      return buffer.slice(0, offset);
    }
  };
}

export function encodeVarint(value: number) {
  const bytes = [];
  while (value > 127) {
    bytes.push((value & 127) | 128);
    value >>>= 7;
  }
  bytes.push(value);
  return bytes;
}

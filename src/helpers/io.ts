import { encodeBitmask } from './bitmask.js';

const textDecoder = new TextDecoder();

export function readVarint(dv: DataView, offset: number, signed = false) {
  let value = 0;
  let shift = 0;
  let byte: number;
  do {
    byte = dv.getUint8(offset++);
    value |= (byte & 127) << shift;
    shift += 7;
  } while (byte & 128);
  if (signed) {
    return value & 1 ? -(value >> 1) - 1 : value >> 1;
  }
  return value;
}

export function writeVarint(
  dv: DataView,
  offset: number,
  value: number,
  signed = false
) {
  if (signed) {
    value = (value << 1) ^ (value >> 63)
  }
  while (value > 127) {
    dv.setUint8(offset++, (value & 127) | 128);
    value >>>= 7;
  }
  dv.setUint8(offset, value);
}

export function readString(dv: DataView, offset: number) {
  const [_length, _offset] = readPrefixedVarint(dv, offset);
  return textDecoder.decode(new Uint8Array(dv.buffer, _offset, _length));
}

export function readBitmask(dv: DataView, offset: number) {
  const [_length, _offset] = readPrefixedVarint(dv, offset);
  return new Uint8Array(dv.buffer, _offset, _length);
}

export function createStringWriter(startOffset = 0) {
  const textEncoder = new TextEncoder();
  let buffer = new Uint8Array(4); // reserve 4 bytes for varint prefix
  let offset = 0;

  return {
    write(str: string) {
      const encoded = textEncoder.encode(str);
      const currOffset = offset;
      const encodedOffset = writePrefixedVarint(buffer, offset, encoded.length);
      const nextOffset = encodedOffset + encoded.length;
      if (buffer.length < nextOffset + 4) {
        const newBuffer = new Uint8Array(nextOffset * 2);
        newBuffer.set(buffer);
        buffer = newBuffer;
      }
      buffer.set(encoded, encodedOffset);
      offset = nextOffset;
      return startOffset + currOffset;
    },
    export() {
      return buffer.slice(0, offset);
    }
  };
}

export type StringWriter = ReturnType<typeof createStringWriter>;

export function createBitmaskWriter(startOffset = 0) {
  let buffer = new Uint8Array(4); // reserve 4 bytes for varint prefix
  let offset = 0;

  return {
    write(bitmask: Iterable<number>, maxIndex: number, noOfClasses = 1) {
      const n = maxIndex * noOfClasses + noOfClasses - 1;
      const encoded = encodeBitmask(bitmask, n);
      const currentOffset = offset;
      const encodedOffset = writePrefixedVarint(buffer, offset, encoded.length);
      const nextOffset = encodedOffset + encoded.length;
      if (buffer.length < nextOffset + 4) {
        const newBuffer = new Uint8Array(nextOffset * 2);
        newBuffer.set(buffer);
        buffer = newBuffer;
      }
      buffer.set(encoded, encodedOffset);
      offset = nextOffset;
      return startOffset + currentOffset;
    },
    export() {
      return buffer.slice(0, offset);
    }
  };
}

function readPrefixedVarint(dv: DataView, offset: number) {
  let _offset = readVarint(dv, offset, true);
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

function writePrefixedVarint(
  buffer: Uint8Array,
  offset: number,
  value: number
) {
  while (value > 127) {
    buffer[offset++] = (value & 127) | 128;
    value >>>= 7;
  }
  buffer[offset++] = value;
  return offset;
}

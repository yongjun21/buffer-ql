import { encodeBitmask } from './bitmask';

const textDecoder = new TextDecoder();

export function readString(dv: DataView, offset: number) {
  const _offset = dv.getFloat32(offset, true);
  const _length = dv.getFloat32(offset + 4, true);
  return textDecoder.decode(new Uint8Array(dv.buffer, _offset, _length));
}

export function createStringWriter() {
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
      const output: [number, number] = [offset, encoded.length];
      offset += encoded.length;
      return output;
    },
    export() {
      return buffer.slice(0, offset);
    }
  };
}

export type StringWriter = ReturnType<typeof createStringWriter>;

export function createBitmaskWriter() {
  let buffer = new Uint8Array(0);
  let offset = 0;

  return {
    write(bitmask: Iterable<number>, n: number) {
      const encoded = encodeBitmask(bitmask, n);
      const requiredLength = offset + encoded.length;
      if (buffer.length < requiredLength) {
        const newBuffer = new Uint8Array(requiredLength * 2);
        newBuffer.set(buffer);
        buffer = newBuffer;
      }
      buffer.set(encoded, offset);
      const output: [number, number] = [offset, encoded.length];
      offset += encoded.length;
      return output;
    },
    export() {
      return buffer.slice(0, offset);
    }
  };
}

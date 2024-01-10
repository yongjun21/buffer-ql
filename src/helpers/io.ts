const textEncoder = new TextEncoder();
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
    value = (value << 1) ^ (value >> 63);
  }
  while (value > 127) {
    dv.setUint8(offset++, (value & 127) | 128);
    value >>>= 7;
  }
  dv.setUint8(offset, value);
}

export function readString(dv: DataView, offset: number) {
  const encoded = DataTape.read(dv, offset);
  return textDecoder.decode(encoded);
}

export function sizeString(str: string, db: DataTape) {
  const encoded = textEncoder.encode(str);
  return db.put(encoded, str);
}

export class DataTape {
  private buffer = new Uint8Array(4);
  private offset = 0;
  private offsetDelta = 0;
  private index = new Map<any, number>();

  static read(dv: DataView, offset: number) {
    const [_length, _offset] = readPrefixedVarint(dv, offset);
    return new Uint8Array(dv.buffer, _offset, _length);
  }

  static write(
    dv: DataView,
    offset: number,
    value: any,
    db: DataTape
  ) {
    writeVarint(dv, offset, db.get(value), true);
  }

  get(key: any) {
    const i = this.index.get(key);
    return i == null ? -1 : i + this.offsetDelta;
  }

  put(value: Uint8Array, key: any) {
    const { buffer, offset, index } = this;
    if (index.has(key)) return 0;
    index.set(key, offset);
    const encodedOffset = writePrefixedVarint(buffer, offset, value.length);
    const nextOffset = encodedOffset + value.length;
    if (buffer.length < nextOffset + 4) {
      const newBuffer = new Uint8Array(nextOffset * 2);
      newBuffer.set(buffer);
      this.buffer = newBuffer;
    }
    this.buffer.set(value, encodedOffset);
    this.offset = nextOffset;
    return nextOffset - offset;
  }

  shift(to: number) {
    this.offsetDelta = to;
  }

  export() {
    return this.buffer.slice(0, this.offset);
  }
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

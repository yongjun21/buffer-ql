import { typed } from '../helpers/common';
import type { SchemaTypeReader as Reader } from '../schema';

const textDecoder = new TextDecoder();

export const SCHEMA_PRIMITIVE_TYPES = [
  {
    name: 'Uint8',
    size: 1,
    read: typed<Reader>((dv, offset) => dv.getUint8(offset))
  },
  {
    name: 'Int8',
    size: 1,
    read: typed<Reader>((dv, offset) => dv.getInt8(offset))
  },
  {
    name: 'Uint16',
    size: 2,
    read: typed<Reader>((dv, offset) => dv.getUint16(offset, true))
  },
  {
    name: 'Int16',
    size: 2,
    read: typed<Reader>((dv, offset) => dv.getInt16(offset, true))
  },
  {
    name: 'Uint32',
    size: 4,
    read: typed<Reader>((dv, offset) => dv.getUint32(offset, true))
  },
  {
    name: 'Int32',
    size: 4,
    read: typed<Reader>((dv, offset) => dv.getInt32(offset, true))
  },
  {
    name: 'Float32',
    size: 4,
    read: typed<Reader>((dv, offset) => dv.getFloat32(offset, true))
  },
  {
    name: 'Float64',
    size: 8,
    read: typed<Reader>((dv, offset) => dv.getFloat64(offset, true))
  },
  // offset + length
  {
    name: 'Pointer',
    size: 8,
    read: typed<Reader>((dv, offset) => [
      dv.getFloat32(offset, true),
      dv.getFloat32(offset + 4, true)
    ])
  },
  // strings are just pointer to an UTF8 array
  {
    name: 'String',
    size: 8,
    read: typed<Reader>((dv, offset) => {
      const _offset = dv.getFloat32(offset, true);
      const _length = dv.getFloat32(offset + 4, true);
      return textDecoder.decode(new Uint8Array(dv.buffer, _offset, _length));
    })
  },
  // 2 * Float32
  {
    name: 'Vector2',
    size: 12,
    read: typed<Reader>((dv, offset) => [
      dv.getFloat32(offset, true),
      dv.getFloat32(offset + 4, true)
    ])
  },
  // 3 * Float32
  {
    name: 'Vector3',
    size: 12,
    read: typed<Reader>((dv, offset) => [
      dv.getFloat32(offset, true),
      dv.getFloat32(offset + 4, true),
      dv.getFloat32(offset + 8, true)
    ])
  },
  // 4 * Float32
  {
    name: 'Vector4',
    size: 12,
    read: typed<Reader>((dv, offset) => [
      dv.getFloat32(offset, true),
      dv.getFloat32(offset + 4, true),
      dv.getFloat32(offset + 8, true),
      dv.getFloat32(offset + 12, true)
    ])
  },
  // 9 * Float32
  {
    name: 'Matrix3',
    size: 36,
    read: typed<Reader>((dv, offset) => new Float32Array(dv.buffer, offset, 9))
  },
  // 16 * Float32
  {
    name: 'Matrix4',
    size: 64,
    read: typed<Reader>((dv, offset) => new Float32Array(dv.buffer, offset, 16))
  },
  // Bitmask is an Uint8 array
  {
    name: 'Bitmask',
    size: 1,
    read: typed<Reader>((dv, offset) => dv.getUint8(offset))
  }
] as const;

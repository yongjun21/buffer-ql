import { readString, StringWriter } from '../helpers/io.js';
import { typed } from '../helpers/common.js';

import type {
  SchemaTypeEncoder as Encoder,
  SchemaTypeDecoder as Decoder,
  SchemaTypeChecker as Checker
} from './index.js';

export const SCHEMA_BASE_PRIMITIVE_TYPES = [
  {
    name: 'Uint8',
    size: 1,
    decode: typed<Decoder<number>>((dv, offset) => dv.getUint8(offset)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setUint8(offset, value);
    }),
    check: typed<Checker>(
      value => typeof value === 'number' && value >= 0 && value <= 255
    )
  },
  {
    name: 'Int8',
    size: 1,
    decode: typed<Decoder<number>>((dv, offset) => dv.getInt8(offset)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setInt8(offset, value);
    }),
    check: typed<Checker>(
      value => typeof value === 'number' && value >= -128 && value <= 127
    )
  },
  {
    name: 'Uint16',
    size: 2,
    decode: typed<Decoder<number>>((dv, offset) => dv.getUint16(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setUint16(offset, value, true);
    }),
    check: typed<Checker>(
      value => typeof value === 'number' && value >= 0 && value <= 65535
    )
  },
  {
    name: 'Int16',
    size: 2,
    decode: typed<Decoder<number>>((dv, offset) => dv.getInt16(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setInt16(offset, value, true);
    }),
    check: typed<Checker>(
      value => typeof value === 'number' && value >= -32768 && value <= 32767
    )
  },
  {
    name: 'Uint32',
    size: 4,
    decode: typed<Decoder<number>>((dv, offset) => dv.getUint32(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setUint32(offset, value, true);
    }),
    check: typed<Checker>(
      value => typeof value === 'number' && value >= 0 && value <= 4294967295
    )
  },
  {
    name: 'Int32',
    size: 4,
    decode: typed<Decoder<number>>((dv, offset) => dv.getInt32(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setInt32(offset, value, true);
    }),
    check: typed<Checker>(
      value =>
        typeof value === 'number' && value >= -2147483648 && value <= 2147483647
    )
  },
  {
    name: 'Float32',
    size: 4,
    decode: typed<Decoder<number>>((dv, offset) => dv.getFloat32(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setFloat32(offset, value, true);
    }),
    check: typed<Checker>(
      value =>
        typeof value === 'number' &&
        value >= -3.4028234663852886e38 &&
        value <= 3.4028234663852886e38
    )
  },
  {
    name: 'Float64',
    size: 8,
    decode: typed<Decoder<number>>((dv, offset) => dv.getFloat64(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setFloat32(offset, value, true);
    }),
    check: typed<Checker>(
      value =>
        typeof value === 'number' &&
        value >= -1.7976931348623157e308 &&
        value <= 1.7976931348623157e308
    )
  },
  // strings are just pointer to an UTF8 array
  {
    name: 'String',
    size: 8,
    decode: typed<Decoder<string>>(readString),
    encode: typed<Encoder<string>>(
      (dv, offset, value, stringWriter: StringWriter) => {
        const [_offset, _length] = stringWriter.write(value);
        dv.setFloat32(offset, _offset, true);
        dv.setFloat32(offset + 4, _length, true);
      }
    ),
    check: typed<Checker>(value => typeof value === 'string')
  },
  // 2 * Float32
  {
    name: 'Vector2',
    size: 8,
    decode: typed<Decoder<Float32Array>>(
      (dv, offset) => new Float32Array(dv.buffer, offset, 2)
    ),
    encode: typed<Encoder<number[]>>((dv, offset, value) => {
      value.forEach((v, i) => dv.setFloat32(offset + i * 4, v, true));
    }),
    check: typed<Checker>(
      value =>
        Array.isArray(value) &&
        value.length === 2 &&
        value.every(v => typeof v === 'number')
    )
  },
  // 3 * Float32
  {
    name: 'Vector3',
    size: 12,
    decode: typed<Decoder<Float32Array>>(
      (dv, offset) => new Float32Array(dv.buffer, offset, 3)
    ),
    encode: typed<Encoder<number[]>>((dv, offset, value) => {
      value.forEach((v, i) => dv.setFloat32(offset + i * 4, v, true));
    }),
    check: typed<Checker>(
      value =>
        Array.isArray(value) &&
        value.length === 3 &&
        value.every(v => typeof v === 'number')
    )
  },
  // 4 * Float32
  {
    name: 'Vector4',
    size: 16,
    decode: typed<Decoder<Float32Array>>(
      (dv, offset) => new Float32Array(dv.buffer, offset, 4)
    ),
    encode: typed<Encoder<number[]>>((dv, offset, value) => {
      value.forEach((v, i) => dv.setFloat32(offset + i * 4, v, true));
    }),
    check: typed<Checker>(
      value =>
        Array.isArray(value) &&
        value.length === 4 &&
        value.every(v => typeof v === 'number')
    )
  },
  // 9 * Float32
  {
    name: 'Matrix3',
    size: 36,
    decode: typed<Decoder<Float32Array>>(
      (dv, offset) => new Float32Array(dv.buffer, offset, 9)
    ),
    encode: typed<Encoder<number[]>>((dv, offset, value) => {
      value.forEach((v, i) => dv.setFloat32(offset + i * 4, v, true));
    }),
    check: typed<Checker>(
      value =>
        Array.isArray(value) &&
        value.length === 9 &&
        value.every(v => typeof v === 'number')
    )
  },
  // 16 * Float32
  {
    name: 'Matrix4',
    size: 64,
    decode: typed<Decoder<Float32Array>>(
      (dv, offset) => new Float32Array(dv.buffer, offset, 16)
    ),
    encode: typed<Encoder<number[]>>((dv, offset, value) => {
      value.forEach((v, i) => dv.setFloat32(offset + i * 4, v, true));
    }),
    check: typed<Checker>(
      value =>
        Array.isArray(value) &&
        value.length === 16 &&
        value.every(v => typeof v === 'number')
    )
  }
] as const;

export const SCHEMA_BASE_COMPOUND_TYPES = [
  {
    name: 'Vector2Array',
    type: 'Array',
    children: typed<string[]>(['Vector2']),
    transform: (arr: any) => transformFlattenedTupleList(arr, 2),
    check: checkIsFlattenedTupleList
  },
  {
    name: 'Vector3Array',
    type: 'Array',
    children: typed<string[]>(['Vector3']),
    transform: (arr: any) => transformFlattenedTupleList(arr, 3),
    check: checkIsFlattenedTupleList
  },
  {
    name: 'Vector4Array',
    type: 'Array',
    children: typed<string[]>(['Vector4']),
    transform: (arr: any) => transformFlattenedTupleList(arr, 4),
    check: checkIsFlattenedTupleList
  },
  {
    name: 'Matrix3Array',
    type: 'Array',
    children: typed<string[]>(['Matrix3']),
    transform: (arr: any) => transformFlattenedTupleList(arr, 9),
    check: checkIsFlattenedTupleList
  },
  {
    name: 'Matrix4Array',
    type: 'Array',
    children: typed<string[]>(['Matrix4']),
    transform: (arr: any) => transformFlattenedTupleList(arr, 16),
    check: checkIsFlattenedTupleList
  }
] as const;

function transformFlattenedTupleList(arr: ArrayLike<number>, size: number) {
  return new Proxy(arr, {
    get(target, prop) {
      if (typeof prop === 'string') {
        if (prop === 'length') return target.length / size;
        if (/^[0-9]+$/.test(prop)) {
          const i = Number(prop);
          const value = [];
          for (let j = 0; j < size; j++) {
            value.push(target[i * size + j]);
          }
          return value;
        }
      }
      return Reflect.get(target, prop);
    }
  });
}

function checkIsFlattenedTupleList(value: any) {
  if (!Array.isArray(value) && !(value instanceof Float32Array)) {
    return false;
  }
  return value.every(v => typeof v === 'number');
}

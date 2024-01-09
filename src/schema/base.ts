import { readString, StringWriter, writeVarint } from '../helpers/io.js';
import { typed } from '../helpers/common.js';

import type {
  SchemaTypeEncoder as Encoder,
  SchemaTypeDecoder as Decoder,
  SchemaTypeChecker as Checker
} from './index.js';

const isNumber: Checker = value => typeof value === 'number';
const isString: Checker = value => typeof value === 'string';

export const SCHEMA_BASE_PRIMITIVE_TYPES = [
  {
    name: 'Uint8',
    size: 1,
    decode: typed<Decoder<number>>((dv, offset) => dv.getUint8(offset)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setUint8(offset, value);
    }),
    check: isNumber
  },
  {
    name: 'Int8',
    size: 1,
    decode: typed<Decoder<number>>((dv, offset) => dv.getInt8(offset)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setInt8(offset, value);
    }),
    check: isNumber
  },
  {
    name: 'Uint16',
    size: 2,
    decode: typed<Decoder<number>>((dv, offset) => dv.getUint16(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setUint16(offset, value, true);
    }),
    check: isNumber
  },
  {
    name: 'Int16',
    size: 2,
    decode: typed<Decoder<number>>((dv, offset) => dv.getInt16(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setInt16(offset, value, true);
    }),
    check: isNumber
  },
  {
    name: 'Uint32',
    size: 4,
    decode: typed<Decoder<number>>((dv, offset) => dv.getUint32(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setUint32(offset, value, true);
    }),
    check: isNumber
  },
  {
    name: 'Int32',
    size: 4,
    decode: typed<Decoder<number>>((dv, offset) => dv.getInt32(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setInt32(offset, value, true);
    }),
    check: isNumber
  },
  {
    name: 'Float32',
    size: 4,
    decode: typed<Decoder<number>>((dv, offset) => dv.getFloat32(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setFloat32(offset, value, true);
    }),
    check: isNumber
  },
  {
    name: 'Float64',
    size: 8,
    decode: typed<Decoder<number>>((dv, offset) => dv.getFloat64(offset, true)),
    encode: typed<Encoder<number>>((dv, offset, value) => {
      dv.setFloat32(offset, value, true);
    }),
    check: isNumber
  },
  // strings are just pointer to an UTF8 array
  {
    name: 'String',
    size: 4,
    decode: typed<Decoder<string>>(readString),
    encode: typed<Encoder<string>>(
      (dv, offset, value, stringWriter: StringWriter) => {
        writeVarint(dv, offset, stringWriter.write(value), true);
      }
    ),
    check: isString
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
        value.every(isNumber)
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
        value.every(isNumber)
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
        value.every(isNumber)
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
        value.every(isNumber)
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
        value.every(isNumber)
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
  if (value instanceof Float32Array) return true;
  return Array.isArray(value) && value.every(isNumber);
}

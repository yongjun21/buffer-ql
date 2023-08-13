import {
  SCHEMA_BASE_PRIMITIVE_TYPES,
  SCHEMA_BASE_COMPOUND_TYPES
} from './base.js';
import { parseExpression } from './compound.js';

import { typed } from '../helpers/common.js';

import type {
  SchemaTypeModifierName,
  SchemaCompoundTypeExpression
} from './compound.js';

export type SchemaTypeDecoder<T> = (dv: DataView, offset: number) => T;
export type SchemaTypeEncoder<T> = (
  dv: DataView,
  offset: number,
  value: T,
  ...args: any[]
) => void;
export type SchemaTypeChecker = (value: any) => boolean;
export interface SchemaPrimitiveType {
  size: number;
  decode: SchemaTypeDecoder<any>;
  encode: SchemaTypeEncoder<any>;
  transform?: (value: any) => any;
  check?: SchemaTypeChecker;
}

export interface SchemaCompoundType<T extends string> {
  type: T;
  size: number;
  children: string[];
  transform?: (value: any) => any;
  check?: SchemaTypeChecker;
}

export interface SchemaNamedTupleType extends SchemaCompoundType<'NamedTuple'> {
  keys: string[];
  indexes: Record<string, number>;
}

type SchemaBaseTypeName =
  | (typeof SCHEMA_BASE_PRIMITIVE_TYPES)[number]['name']
  | (typeof SCHEMA_BASE_COMPOUND_TYPES)[number]['name'];

export type SchemaTypeExpression<T extends string> =
  | T
  | SchemaBaseTypeName
  | SchemaCompoundTypeExpression<T | SchemaBaseTypeName>;

export type SchemaTypeDefinition<T extends string = string> =
  | SchemaTypeExpression<T>
  | SchemaTypeExpression<T>[]
  | Record<string, SchemaTypeExpression<T>>;

type SchemaType =
  | (SchemaPrimitiveType & { type: 'Primitive' })
  | SchemaCompoundType<SchemaTypeModifierName | 'Tuple' | 'Alias'>
  | SchemaNamedTupleType;

export type Schema = Record<string, SchemaType>;

const SCHEMA_COMPOUND_TYPE_SIZE = {
  // offset + length
  Array: 8,
  // offset to keys + offset to values + length
  Map: 12,
  // (offset + length) to bitmask + offset to value
  Optional: 12,
  // offset to branch0 + (offset + length) to bitmask0 +
  // offset to branch1 + (offset + length) to bitmask1 + ...
  // offset to branchN
  OneOf: 12,
  // offset to value + at index
  Ref: 8,
  // offset to value on linked data + at index
  Link: 8,
  // alias type is always forwarded
  Alias: 0,
  // offset to values
  Tuple: 4,
  // offset to values
  NamedTuple: 4
};

export function extendSchema<T extends string, U extends T, V extends U>(
  baseTypes: Record<V, SchemaPrimitiveType>,
  types: { [_ in T]?: SchemaTypeDefinition<U> },
  transforms: { [_ in T]?: (value: any) => any } = {},
  checks: { [_ in T]?: (value: any) => boolean } = {}
) {
  const schema: Schema = {};
  for (const record of SCHEMA_BASE_PRIMITIVE_TYPES) {
    schema[record.name] = {
      ...record,
      type: 'Primitive'
    };
  }
  for (const record of SCHEMA_BASE_COMPOUND_TYPES) {
    schema[record.name] = {
      ...record,
      size: SCHEMA_COMPOUND_TYPE_SIZE[record.type]
    };
  }
  for (const [label, record] of Object.entries<SchemaPrimitiveType>(
    baseTypes
  )) {
    schema[label] = {
      ...record,
      type: 'Primitive'
    };
  }

  for (const [label, value] of Object.entries<any>(types)) {
    if (typeof value === 'string') {
      for (const [_label, _value] of Object.entries(
        parseExpression(label, value)
      )) {
        schema[_label] = {
          ..._value,
          size: SCHEMA_COMPOUND_TYPE_SIZE[_value.type],
          transform: transforms[_label as T],
          check: checks[_label as T]
        } as SchemaType;
      }
    } else if (Array.isArray(value!)) {
      const record: SchemaType = {
        type: 'Tuple',
        children: [],
        size: SCHEMA_COMPOUND_TYPE_SIZE.Tuple,
        check: typed<SchemaTypeChecker>(Array.isArray)
      };
      schema[label] = record;
      value.forEach((exp, i) => {
        const _label = `${label}[${i}]`;
        record.children.push(_label);
        Object.assign(schema, parseExpression(_label, exp));
      });
    } else {
      const record: SchemaType = {
        type: 'NamedTuple',
        children: [],
        keys: [],
        indexes: {},
        size: SCHEMA_COMPOUND_TYPE_SIZE.NamedTuple
      };
      schema[label] = record;
      Object.entries<string>(value).forEach(([key, exp], i) => {
        const _label = `${label}.${key}`;
        record.children.push(_label);
        record.keys.push(key);
        record.indexes[key] = i;
        Object.assign(schema, parseExpression(_label, exp));
      });
    }
  }

  validateSchema(schema);
  forwardAlias(schema);
  return schema;
}

function validateSchema(schema: Schema) {
  for (const [label, record] of Object.entries(schema)) {
    if (record.type !== 'Primitive' && record.type !== 'Link') {
      record.children.forEach(child => {
        if (!schema[child]) {
          throw new TypeError(`Missing type definition ${child} for ${label}`);
        }
      });
    }

    if (
      record.type === 'Array' ||
      record.type === 'Map' ||
      record.type === 'Optional' ||
      record.type === 'Ref' ||
      record.type === 'Link'
    ) {
      if (record.children.length !== 1) {
        throw new TypeError(
          `Modifier type ${record.type} should reference only a single child`
        );
      }
    }
    if (record.type === 'OneOf') {
      if (record.children.length < 2) {
        throw new TypeError(
          `Modifier type OneOf should reference at least two children`
        );
      }
      if (record.children.length > new Set(record.children).size) {
        throw new TypeError(
          `Modifier type OneOf should not reference duplicate children`
        );
      }
      record.children.forEach(child => {
        if (!schema[child].check) {
          throw new TypeError(
            `Type ${child} is present as an OneOf option but missing a check function`
          );
        }
      });
    }

    if (record.type === 'Optional') {
      if (schema[record.children[0]].type === 'Optional') {
        throw new TypeError(
          `Modifier type Optional should not reference another Optional`
        );
      }
    }

    if (record.type === 'Ref') {
      if (schema[record.children[0]].type === 'Ref') {
        throw new TypeError(
          `Modifier type Ref should not reference another Ref`
        );
      }
    }

    if (record.type === 'Link') {
      const [schemaName, ...rest] = record.children[0].split('/');
      const typeName = rest.join('/');
      if (schemaName === '' || typeName === '') {
        throw new TypeError(
          `Invalid Link ${record.children[0]}. Use the pattern Link<SchemaKey/TypeName> to reference a type from another schema`
        );
      }
    }
  }
}

function forwardAlias(schema: Schema, replaced = 0) {
  if (replaced > Object.keys(schema).length) {
    throw new TypeError('Circular alias reference detected');
  }
  let count = 0;
  for (const [label, record] of Object.entries(schema)) {
    if (record.type === 'Alias') {
      schema[label] = schema[record.children[0]];
      count++;
    }
  }
  if (count > 0) forwardAlias(schema, replaced + count);
}

import { SCHEMA_BASE_TYPES } from './primitives.js';
import {
  SchemaTypeModifierName,
  SchemaCompoundTypeExpression,
  parseExpression
} from './compound.js';

export type SchemaTypeReader = (dv: DataView, offset: number) => any;
export interface SchemaPrimitiveType {
  size: number;
  read: SchemaTypeReader;
}

export interface SchemaCompoundType<T extends string> {
  type: T;
  size: number;
  children: string[];
}

export interface SchemaNamedTupleType extends SchemaCompoundType<'NamedTuple'> {
  type: 'NamedTuple';
  keyIndex: Record<string, number>;
}

type SchemaBaseTypeName = (typeof SCHEMA_BASE_TYPES)[number]['name'];

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
  | SchemaCompoundType<SchemaTypeModifierName | 'Alias' | 'Tuple'>
  | SchemaNamedTupleType;

export type Schema = Record<string, SchemaType>;

const SCHEMA_COMPOUND_TYPE_SIZE = {
  // offset + length
  Array: 8,
  // offset to keys + offset to values + length
  Map: 12,
  // (offset + length) to bitmask + offset to value
  // optional type is always forwarded
  Optional: 0,
  // offset to branch0 + (offset + length) to bitmask0 +
  // offset to branch1 + (offset + length) to bitmask1 + ...
  // offset to branchN
  OneOf: 12,
  // offset to value on linked data
  // link type is always forwarded
  Link: 0,
  // alias type is always forwarded
  Alias: 0,
  // offset to values
  Tuple: 4,
  // offset to values
  NamedTuple: 4
} as const;

export function extendSchema<T extends string, U extends T, V extends U>(
  baseTypes: Record<V, SchemaPrimitiveType>,
  types: { [_ in T]?: SchemaTypeDefinition<U> }
) {
  const schema: Schema = {};
  for (const record of SCHEMA_BASE_TYPES) {
    schema[record.name] = {
      ...record,
      type: 'Primitive'
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

  for (const [label, value] of Object.entries(types)) {
    if (typeof value === 'string') {
      for (const [_label, _value] of Object.entries(
        parseExpression(label, value)
      )) {
        schema[_label] = {
          ..._value,
          size: SCHEMA_COMPOUND_TYPE_SIZE[_value.type]
        };
      }
    } else if (Array.isArray(value!)) {
      const record: SchemaType = {
        type: 'Tuple',
        children: [],
        size: SCHEMA_COMPOUND_TYPE_SIZE.Tuple
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
        keyIndex: {},
        size: SCHEMA_COMPOUND_TYPE_SIZE.NamedTuple
      };
      schema[label] = record;
      Object.entries(value!).forEach(([key, exp], i) => {
        const _label = `${label}.${key}`;
        record.children.push(_label);
        record.keyIndex[key] = i;
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
    }

    if (record.type === 'Optional') {
      if (schema[record.children[0]].type === 'Optional') {
        throw new TypeError(
          `Modifier type Optional should not reference another Optional`
        );
      }
    }

    if (record.type === 'Link') {
      const [schemaName, ...rest] = record.children[0].split('/');
      const typeName = rest.join('/');
      if (schemaName === '' || typeName === '') {
        throw new TypeError(
          `Invalid Link ${record.children[0]}. Use the pattern Link<Schema/Type> to reference a type from another schema`
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

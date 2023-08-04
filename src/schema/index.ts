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

export interface SchemaCompoundType<T extends SchemaTypeModifierName> {
  type: T;
  size: number;
  children: string[];
}

export interface SchemaTupleType {
  type: 'Tuple';
  size: number;
  children: string[];
}

export interface SchemaNamedTupleType extends Omit<SchemaTupleType, 'type'> {
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
  | SchemaPrimitiveType
  | SchemaCompoundType<SchemaTypeModifierName>
  | SchemaTupleType
  | SchemaNamedTupleType;

export type Schema = Record<string, SchemaType>;

export function extendSchema<T extends string, U extends T, V extends U>(
  baseTypes: Record<V, SchemaPrimitiveType>,
  types: { [_ in T]?: SchemaTypeDefinition<U> }
) {
  const schema: Schema = {};
  for (const record of SCHEMA_BASE_TYPES) {
    schema[record.name] = record;
  }
  Object.assign(schema, baseTypes);

  for (const [label, value] of Object.entries(types)) {
    if (typeof value === 'string') {
      Object.assign(schema, parseExpression(label, value));
    } else if (Array.isArray(value!)) {
      const record: SchemaType = {
        type: 'Tuple',
        size: 4,
        children: []
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
        size: 4,
        children: [],
        keyIndex: {}
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
  return schema;
}

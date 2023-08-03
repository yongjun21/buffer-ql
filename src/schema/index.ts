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

export interface SchemaCompoundType {
  size: number;
  modifier: SchemaTypeModifierName;
  children: string[];
}

export interface SchemaTupleType {
  size: number;
  children: string[];
}

export interface SchemaNamedTupleType extends SchemaTupleType {
  keyIndex: Record<string, number>;
}

type SchemaBaseTypeName = (typeof SCHEMA_BASE_TYPES)[number]['name'];

export type SchemaTypeExpression<T extends string> =
  | T
  | SchemaBaseTypeName
  | SchemaCompoundTypeExpression<T | SchemaBaseTypeName>;

type SchemaTypeDefinition<T extends string = string> =
  | SchemaTypeExpression<T>
  | SchemaTypeExpression<T>[]
  | Record<string, SchemaTypeExpression<T>>;

export function extendSchema<T extends string, U extends T, V extends U>(
  baseTypes: Record<V, SchemaPrimitiveType>,
  types: { [_ in T]?: SchemaTypeDefinition<U> }
) {
  const schema = {} as Record<
    string,
    | SchemaPrimitiveType
    | SchemaCompoundType
    | SchemaTupleType
    | SchemaNamedTupleType
  >;
  for (const record of SCHEMA_BASE_TYPES) {
    schema[record.name] = record;
  }
  Object.assign(schema, baseTypes);

  for (const [label, value] of Object.entries(types)) {
    if (typeof value === 'string') {
      Object.assign(schema, parseExpression(label, value));
    } else if (Array.isArray(value!)) {
      const record: SchemaTupleType = {
        size: 0,
        children: []
      };
      schema[label] = record;
      value.forEach((exp, i) => {
        const _label = `${label}[${i}]`;
        record.children.push(_label);
        Object.assign(schema, parseExpression(_label, exp));
      });
      record.size = record.children.length * 8;
    } else {
      const record: SchemaNamedTupleType = {
        size: 0,
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
      record.size = record.children.length * 8;
    }
  }
  return schema;
}

import { SCHEMA_BASE_TYPES } from './primitives.js';
import type { SchemaCompoundTypeName } from './compound.js';

export type SchemaTypeReader = (dv: DataView, offset: number) => any;

export interface SchemaPrimitiveType {
  size: number;
  read: SchemaTypeReader;
}

type SchemaBaseTypeName = (typeof SCHEMA_BASE_TYPES)[number]['name'];

export type SchemaTypeExpression<T extends string> =
  | T
  | SchemaBaseTypeName
  | SchemaCompoundTypeName<T | SchemaBaseTypeName>;

type SchemaTypeDefinition<T extends string = string> =
  | SchemaTypeExpression<T>
  | SchemaTypeExpression<T>[]
  | Record<string, SchemaTypeExpression<T>>

export function extendSchema<T extends string, U extends T, V extends U>(
  baseTypes: Record<V, SchemaPrimitiveType>,
  types: { [_ in T]?: SchemaTypeDefinition<U> }
) {
  type SchemaRecordKey = T | SchemaBaseTypeName;
  const schema = {} as Record<
    SchemaRecordKey,
    SchemaPrimitiveType | SchemaTypeDefinition
  >;
  for (const record of SCHEMA_BASE_TYPES) {
    schema[record.name] = record;
  }
  Object.assign(schema, types, baseTypes);
  return schema;
}

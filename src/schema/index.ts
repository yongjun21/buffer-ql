import { SCHEMA_PRIMITIVE_TYPES } from './primitives.js';
import { SCHEMA_COMPOUND_TYPES } from './compound.js';

import type { Modifier } from '../types/common';

export type SchemaTypeReader = (dv: DataView, offset: number) => any;

interface SchemaPrimitiveType {
  size: number;
  read: SchemaTypeReader;
}

type SchemaPrimitiveTypeName = (typeof SCHEMA_PRIMITIVE_TYPES)[number]['name'];
type SchemaCompoundTypeName = (typeof SCHEMA_COMPOUND_TYPES)[number]['name'];

export type SchemaTypeExpression<T extends string> =
  | T
  | SchemaPrimitiveTypeName
  | Modifier<SchemaCompoundTypeName, T | SchemaPrimitiveTypeName>;

type SchemaTypeDefinition<T extends string = string> =
  | SchemaTypeExpression<T>
  | SchemaTypeExpression<T>[]
  | Record<string, SchemaTypeExpression<T>>

export function extendSchema<T extends string, U extends T, V extends U>(
  baseTypes: Record<V, SchemaPrimitiveType>,
  types: { [_ in T]?: SchemaTypeDefinition<U> }
) {
  type SchemaRecordKey = T | SchemaPrimitiveTypeName | SchemaCompoundTypeName;
  const schema = {} as Record<
    SchemaRecordKey,
    SchemaPrimitiveType | SchemaTypeDefinition
  >;
  for (const record of SCHEMA_PRIMITIVE_TYPES) {
    schema[record.name] = record;
  }
  Object.assign(schema, types, baseTypes);
  return schema;
}

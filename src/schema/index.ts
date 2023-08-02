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

type SchemaTypeExpression<T extends string> =
  | T
  | SchemaPrimitiveTypeName
  | Modifier<SchemaCompoundTypeName, T | SchemaPrimitiveTypeName>;

interface SchemaTupleType<T extends string> {
  children: Record<string, SchemaTypeExpression<T>> | SchemaTypeExpression<T>[];
}

type SchemaRecord<T extends string = string> =
  | SchemaPrimitiveType
  | SchemaTupleType<T>;

export function extendSchema<U extends string, T extends U>(
  types: Record<U, SchemaRecord<T>>,
  entryPoints?: Record<`#${string}`, SchemaTypeExpression<T>>
) {
  type SchemaRecordKey = U | SchemaPrimitiveTypeName | SchemaCompoundTypeName;
  const schema = {} as Record<
    SchemaRecordKey,
    SchemaTypeExpression<U> | SchemaRecord<T>
  >;
  for (const record of [
    ...SCHEMA_PRIMITIVE_TYPES,
    ...SCHEMA_COMPOUND_TYPES
  ] as (SchemaRecord<T> & { name: SchemaRecordKey })[]) {
    schema[record.name] = record;
  }
  Object.assign(schema, types, entryPoints);
  return schema;
}

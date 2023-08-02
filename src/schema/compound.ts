import type { Modifier } from '../types/common';

type NestWithoutReplacement<T extends string, U extends string> = {
  [K in T]: Modifier<K, U | Modifier<Exclude<T, K>, U>>;
}[T];

type OneOfPair<T extends string> = {
  [K in T]: `${K},${Exclude<T, K>}`;
}[T];

type OneOfTriplet<T extends string> = {
  [K in T]: `${K},${OneOfPair<Exclude<T, K>>}`;
}[T];

export type SchemaCompoundTypeName<T extends string> =
  | NestWithoutReplacement<'Array' | 'Map' | 'Optional', T>
  | Modifier<'OneOf', OneOfPair<T> | OneOfTriplet<T>>;


export interface ArrayLike<T> {
  length: number;
  [n: number]: T;
}

export interface ArrayConstructor<T> {
  new (length: number): ArrayLike<T>;
}

export type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

export type Getter<T> = (i: number) => T;

export type Modifier<T extends string, U extends string> = `${T}<${U}>`;

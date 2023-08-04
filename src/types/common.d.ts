export interface ArrayLike<T> {
  length: number;
  [n: number]: T;
}

export interface ArrayConstructor<T> {
  new (length: number): { [n: number]: T };
}

export type Getter<T> = (i: number) => T;

export type Modifier<T extends string, U extends string> = `${T}<${U}>`;

export type NestedArray<T> = T | T[] | NestedArray<T>[];

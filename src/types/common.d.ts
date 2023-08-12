export interface ArrayLike<T> {
  length: number;
  [n: number]: T;
}

export interface ArrayConstructor<T> {
  new (length: number): ArrayLike<T>;
}

export type Getter<T> = (i: number) => T;

export type Modifier<T extends string, U extends string> = `${T}<${U}>`;

import type { ArrayConstructor, ArrayLike, Getter } from '../types/common.d.ts';

let defaultMapping = new Int32Array(1);

export function getDefaultIndexMap(n: number) {
  if (n <= defaultMapping.length) return defaultMapping.subarray(0, n);
  defaultMapping = new Int32Array(2 * n);
  for (let i = 0; i < defaultMapping.length; i++) defaultMapping[i] = i;
  Object.freeze(defaultMapping.buffer);
  return defaultMapping.subarray(0, n);
}

export function getIndexMapFromIterable(
  iterable: Iterable<number>,
  length: number,
  Arr?: ArrayConstructor<number>
) {
  const indexMap = (new (Arr || Int32Array)(length)) as Int32Array;
  let i = 0;
  for (const index of iterable) {
    if (i >= length) break;
    indexMap[i++] = index;
  }
  return indexMap;
}

type NamedArrays<T> = { [k in keyof T]: ArrayLike<T[k]> | Getter<T[k]> };

export class WithIndexMap<T = any> {
  _get: Getter<T>;
  indexMap: Int32Array;
  _iter: Int32Array;
  _proxy: ArrayLike<T>;

  constructor(arr: ArrayLike<T>, indexMap?: Int32Array, nullValue?: T);

  constructor(
    arr: NamedArrays<T>,
    indexMap: Int32Array | number,
    nullValue?: T
  );

  constructor(getter: Getter<T>, indexMap: Int32Array | number);

  constructor(
    getter: any,
    indexMap: Int32Array | number | undefined,
    nullValue?: T
  ) {
    if (typeof getter === 'function') {
      this._get = getter;
      this.indexMap =
        indexMap instanceof Int32Array
          ? indexMap
          : getDefaultIndexMap(indexMap ?? 0);
    } else if (Array.isArray(getter) || ArrayBuffer.isView(getter)) {
      const arr = getter as unknown as ArrayLike<T>;
      this._get = i => arr[i] ?? nullValue!;
      this.indexMap =
        indexMap instanceof Int32Array
          ? indexMap
          : getDefaultIndexMap(arr.length);
    } else {
      const obj = getter as NamedArrays<T>;
      const _nullValue = nullValue || ({} as T);
      let currentIndex = 0;
      const el = {} as unknown as T;
      Object.entries<ArrayLike<any> | Getter<any>>(obj).forEach(
        ([key, value]) => {
          const nullValue = _nullValue[key as keyof T];
          Object.defineProperty(el, key, {
            get:
              typeof value === 'function'
                ? () => value(currentIndex)
                : () => value[currentIndex] ?? nullValue,
            enumerable: true
          });
        }
      );
      Object.freeze(el);
      this._get = i => {
        currentIndex = i;
        return el;
      };
      this.indexMap =
        indexMap instanceof Int32Array
          ? indexMap
          : getDefaultIndexMap(indexMap ?? 0);
    }

    this._iter = getDefaultIndexMap(this.indexMap.length);

    const get = (_: any, prop: keyof WithIndexMap) => {
      if (prop in this) return this[prop];
      return this.get(prop as unknown as number);
    };
    this._proxy = new Proxy({}, { get });
  }

  get(i: number) {
    return this._get(this.indexMap[i]);
  }

  *[Symbol.iterator]() {
    for (const i of this._iter) {
      yield this.get(i);
    }
  }

  copyTo<U extends ArrayConstructor<T>>(Arr: U) {
    const arr = new Arr(this.indexMap.length) as InstanceType<U>;
    for (const i of this._iter) {
      arr[i] = this.get(i);
    }
    return arr;
  }

  forEach(fn: (v: T, i: number) => void) {
    return this._iter.forEach(i => fn(this.get(i), i));
  }

  map(fn: (v: T, i: number) => any) {
    const { _get, indexMap } = this;
    return new WithIndexMap(i => fn(_get(indexMap[i]), i), indexMap.length);
  }

  every(fn: (v: T, i: number) => any) {
    return this._iter.every(i => fn(this.get(i), i));
  }

  some(fn: (v: T, i: number) => any) {
    return this._iter.some(i => fn(this.get(i), i));
  }

  find(fn: (v: T, i: number) => any) {
    return this._iter.find(i => fn(this.get(i), i));
  }

  findIndex(fn: (v: T, i: number) => any) {
    return this._iter.findIndex(i => fn(this.get(i), i));
  }

  indexOf(value: T, fromIndex = 0) {
    const n = this.indexMap.length;
    for (let i = fromIndex; i < n; i++) {
      if (this.get(i) === value) return i;
    }
    return -1;
  }

  lastIndexOf(value: T, fromIndex = 0) {
    for (let i = fromIndex; i >= 0; i--) {
      if (this.get(i) === value) return i;
    }
    return -1;
  }

  includes(value: T, fromIndex = 0) {
    const n = this.indexMap.length;
    for (let i = fromIndex; i < n; i++) {
      if (this.get(i) === value) return true;
    }
    return false;
  }

  reduce<U>(fn: (acc: U, v: T, i: number) => U, init: U) {
    return this._iter.reduce((acc, i) => fn(acc, this.get(i), i), init);
  }

  reduceRight<U>(fn: (acc: U, v: T, i: number) => U, init: U) {
    return this._iter.reduceRight((acc, i) => fn(acc, this.get(i), i), init);
  }

  reverse() {
    const n = this.indexMap.length;
    const reversed = new Int32Array(n);
    this.indexMap.forEach((v, i) => {
      reversed[n - 1 - i] = v;
    });
    return new WithIndexMap(this._get, reversed);
  }

  slice(start: number, end: number) {
    return new WithIndexMap(this._get, this.indexMap.slice(start, end));
  }

  filter(fn: (v: T, i: number) => any) {
    const filtered = this.indexMap.filter((_, i) => fn(this.get(i), i));
    return new WithIndexMap(this._get, filtered);
  }

  sort(compare: (a: T, b: T) => number) {
    const n = this.indexMap.length;
    const mapping = new Int32Array(n);
    for (const i of this._iter) mapping[i] = i;

    const stack: number[] = [];
    stack.push(0, n - 1);

    while (stack.length > 0) {
      const end = stack.pop()!;
      const start = stack.pop()!;

      if (start >= end) continue;
      const pivotIndex = mapping[start];
      const pivot = this.get(pivotIndex);
      let i = start;
      let j = end;
      let head = true;
      while (i < j) {
        if (head) {
          if (
            (compare(this.get(mapping[j]), pivot) || mapping[j] - pivotIndex) <
            0
          ) {
            mapping[i] = mapping[j];
            head = false;
            i++;
          } else {
            j--;
          }
        } else {
          if (
            (compare(this.get(mapping[i]), pivot) || mapping[i] - pivotIndex) >
            0
          ) {
            mapping[j] = mapping[i];
            head = true;
            j--;
          } else {
            i++;
          }
        }
      }
      mapping[i] = pivotIndex;

      stack.push(i + 1, end);
      stack.push(start, i - 1);
    }

    for (const i of this._iter) {
      mapping[i] = this.indexMap[mapping[i]];
    }

    return new WithIndexMap(this._get, mapping.subarray(0, n));
  }

  lookup(target: WithIndexMap<T> | ArrayLike<T>) {
    const _target =
      target instanceof WithIndexMap ? target : new WithIndexMap(target);
    const targetIndexMap = this._iter.map(i => _target.indexOf(this.get(i)));
    return new WithIndexMap(_target._get, targetIndexMap);
  }

  get proxy() {
    return this._proxy;
  }

  get length() {
    return this.indexMap.length;
  }

  static dropNull(...arrays: WithIndexMap[]) {
    const n = arrays[0].length;
    let rootIndexMap = new Int32Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (arrays.every(arr => arr.indexMap[i] >= 0)) {
        rootIndexMap[j++] = i;
      }
    }
    rootIndexMap = rootIndexMap.subarray(0, j);
    return arrays.map(arr => {
      const indexMap = rootIndexMap.map(i => arr.indexMap[i]);
      return new WithIndexMap(arr._get, indexMap);
    });
  }
}

import type { ArrayLike, ArrayConstructor, Getter } from '../types/common.js';

let defaultMapping = new Int32Array(1);

export function getDefaultIndexMap(n: number) {
  if (n <= defaultMapping.length) return defaultMapping.subarray(0, n);
  defaultMapping = new Int32Array(2 * n);
  for (let i = 0; i < defaultMapping.length; i++) defaultMapping[i] = i;
  Object.freeze(defaultMapping.buffer);
  return defaultMapping.subarray(0, n);
}

class Tuple<T extends any[]> {
  data: T;

  constructor(...data: T) {
    this.data = data;
  }
}

export function tuple<T extends any[]>(...data: T) {
  return new Tuple(...data);
}

export class LazyArray<T = any> {
  _get: Getter<T>;
  indexMap: Int32Array;
  _iter: Int32Array;
  _proxy: ArrayLike<T>;

  constructor(arr: ArrayLike<T>, indexMap?: Int32Array, nullValue?: T);

  constructor(arr: LazyArray<T>, indexMap?: Int32Array);

  constructor(getter: Getter<T>, indexMap: Int32Array | number);

  constructor(
    arr: Tuple<T extends any[] ? T : never>,
    indexMap: Int32Array | number,
    nullValue?: T extends any[] ? T : never
  );

  constructor(
    arr: T extends Record<string, any> ? T : never,
    indexMap: Int32Array | number,
    nullValue?: T extends Record<string, any> ? T : never
  );

  constructor(getter: any, indexMap?: Int32Array | number, nullValue?: T) {
    if (typeof getter === 'function') {
      this._get = getter;
      this.indexMap =
        indexMap instanceof Int32Array
          ? indexMap
          : getDefaultIndexMap(indexMap ?? 0);
    } else if (getter instanceof LazyArray) {
      const parentIndexMap = getter.indexMap;
      this._get = getter._get;
      this.indexMap =
        indexMap && indexMap instanceof Int32Array
          ? indexMap.map(i => parentIndexMap[i])
          : parentIndexMap;
    } else if (Array.isArray(getter) || ArrayBuffer.isView(getter)) {
      const arr = getter as ArrayLike<T>;
      this._get = i => arr[i] ?? nullValue!;
      this.indexMap =
        indexMap && indexMap instanceof Int32Array
          ? indexMap
          : getDefaultIndexMap(arr.length);
    } else if (getter instanceof Tuple) {
      const tuple = getter as Tuple<T extends any[] ? T : never>;
      const _indexMap =
        indexMap instanceof Int32Array
          ? indexMap
          : getDefaultIndexMap(indexMap ?? 0);
      const _nullValue = (nullValue || []) as any[];
      const getters = tuple.data.map((value, i) => {
        const nested = new LazyArray(value, _indexMap, _nullValue[i]);
        return nested._get;
      });
      this._get = i => {
        return getters.map(getter => getter(i)) as T;
      };
      this.indexMap = _indexMap;
    } else {
      const obj = getter as Record<string, any>;
      const _indexMap =
        indexMap instanceof Int32Array
          ? indexMap
          : getDefaultIndexMap(indexMap ?? 0);
      const _nullValue = (nullValue || {}) as Record<string, any>;
      const getters = Object.entries(obj).map(([key, value]) => {
        const nested = new LazyArray(value, _indexMap, _nullValue[key]);
        return [key, nested._get] as [string, Getter<any>];
      });
      this._get = i => {
        const value: Record<string, any> = {};
        for (const [key, getter] of getters) {
          value[key] = getter(i);
        }
        return value as T;
      };
      this.indexMap = _indexMap;
    }

    this._iter = getDefaultIndexMap(this.indexMap.length);

    const get = (_: any, prop: keyof LazyArray) => {
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

  map<U>(fn: (v: T, i: number) => any) {
    const { _get, indexMap } = this;
    return new LazyArray<U>(i => fn(_get(indexMap[i]), i), indexMap.length);
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

  lazyReduce<U>(fn: (acc: U, v: () => T, i: number) => U, init: U) {
    let currIndex = 0;
    const get = () => this.get(currIndex);
    return this._iter.reduce((acc, i) => {
      currIndex = i;
      return fn(acc, get, i);
    }, init);
  }

  reduceRight<U>(fn: (acc: U, v: T, i: number) => U, init: U) {
    return this._iter.reduceRight((acc, i) => fn(acc, this.get(i), i), init);
  }

  lazyReduceRight<U>(fn: (acc: U, v: () => T, i: number) => U, init: U) {
    let currIndex = 0;
    const get = () => this.get(currIndex);
    return this._iter.reduceRight((acc, i) => {
      currIndex = i;
      return fn(acc, get, i);
    }, init);
  }

  reverse() {
    const n = this.indexMap.length;
    const reversed = new Int32Array(n);
    this.indexMap.forEach((v, i) => {
      reversed[n - 1 - i] = v;
    });
    return new LazyArray(this._get, reversed);
  }

  slice(start: number, end: number) {
    return new LazyArray(this._get, this.indexMap.slice(start, end));
  }

  filter(fn: (v: T, i: number) => any) {
    const filtered = this.indexMap.filter((_, i) => fn(this.get(i), i));
    return new LazyArray(this._get, filtered);
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

    return new LazyArray(this._get, mapping.subarray(0, n));
  }

  findAll<U = any>(
    target: LazyArray<U>,
    matchFn: (a: U, b: T, ai: number, bi: number) => boolean
  ) {
    const indexMap = target
      .map((u, ui) => this.findIndex((v, vi) => matchFn(u, v, ui, vi)))
      .copyTo(Int32Array);
    return new LazyArray(this._get, indexMap);
  }

  get proxy() {
    return this._proxy;
  }

  get length() {
    return this.indexMap.length;
  }

  static nestedForEach<T>(
    arr: LazyArray<T | LazyArray<T>>,
    fn: (v: T, i: number) => void
  ) {
    arr.forEach((nested, i) => {
      nested instanceof LazyArray
        ? this.nestedForEach(nested, fn)
        : fn(nested, i);
    });
  }

  static nestedMap<T, U>(
    arr: LazyArray<T | LazyArray<T>>,
    fn: (v: T, i: number) => U
  ): LazyArray<U | LazyArray<U>> {
    return arr.map((nested, i) => {
      return nested instanceof LazyArray
        ? this.nestedMap(nested, fn)
        : fn(nested, i);
    });
  }

  static nestedReduce<T, U>(
    arr: LazyArray<T | LazyArray<T>>,
    fn: (acc: U, v: () => U | T, i: number) => U,
    init: U
  ): U {
    return arr.lazyReduce((acc, getNested, i) => {
      return fn(
        acc,
        () => {
          const nested = getNested();
          return nested instanceof LazyArray
            ? this.nestedReduce(nested, fn, init)
            : nested;
        },
        i
      );
    }, init);
  }

  static nestedLength<T>(arr: LazyArray<T | LazyArray<T>>) {
    return this.nestedReduce(arr, acc => acc + 1, 0);
  }

  static flattenNested<T>(
    arr: LazyArray<T | LazyArray<T>>
  ): [T[], (number | number[])[]] {
    class Acc {
      flattened: T[] = [];
      indexes: (number | number[])[] = [];
    }

    const { flattened, indexes } = this.nestedReduce(
      arr,
      (acc, getNested, i) => {
        const nested = getNested();
        if (nested instanceof Acc) {
          if (nested.indexes.length > 0)
            acc.indexes.push(nested.indexes as number | number[]);
          else acc.indexes.push(acc.flattened.length);
          for (const v of nested.flattened) acc.flattened.push(v);
        } else {
          acc.flattened.push(nested);
        }
        return acc;
      },
      new Acc()
    );

    return [flattened, indexes];
  }
}

export type NestedLazyArray<T> = LazyArray<T | LazyArray<T>>;

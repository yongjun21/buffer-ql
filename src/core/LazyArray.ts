import { isArray } from '../helpers/common.js';

import type { ArrayLike, ArrayConstructor, Getter } from '../types/common.js';

const CUSTOM_INSPECT_SYMBOL = Symbol.for('nodejs.util.inspect.custom');

let defaultMapping = new Int32Array(0);

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
  _proxy: ArrayLike<T>;

  constructor(arr: ArrayLike<T>, indexMap?: Int32Array, nullValue?: T);

  constructor(arr: LazyArray<T>, indexMap?: Int32Array);

  constructor(getter: Getter<T>, indexMap: Int32Array | number);

  constructor(
    arr: Tuple<any[]>,
    indexMap: Int32Array | number,
    nullValue?: T extends any[] ? T : never
  );

  constructor(
    arr: Record<string, any>,
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
    } else if (isArray(getter)) {
      const arr = getter;
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
    const { _get } = this;
    for (const i of this.indexMap) {
      yield _get(i);
    }
  }

  copyTo<U extends ArrayConstructor<T>>(Arr: U) {
    const { _get } = this;
    const arr = new Arr(this.indexMap.length) as InstanceType<U>;
    this.indexMap.forEach((v, i) => {
      arr[i] = _get(v);
    });
    return arr;
  }

  forEach(fn: (v: T, i: number) => void) {
    const { _get } = this;
    this.indexMap.forEach((v, i) => fn(_get(v), i));
  }

  map<U>(fn: (v: T, i: number) => U) {
    const { _get, indexMap } = this;
    return new LazyArray<U>(i => fn(_get(indexMap[i]), i), indexMap.length);
  }

  every(fn: (v: T, i: number) => any) {
    const { _get } = this;
    return this.indexMap.every((v, i) => fn(_get(v), i));
  }

  some(fn: (v: T, i: number) => any) {
    const { _get } = this;
    return this.indexMap.some((v, i) => fn(_get(v), i));
  }

  find(fn: (v: T, i: number) => any) {
    const { _get } = this;
    const index = this.indexMap.find((v, i) => fn(_get(v), i));
    return index !== undefined ? _get(index) : undefined;
  }

  findIndex(fn: (v: T, i: number) => any) {
    const { _get } = this;
    return this.indexMap.findIndex((v, i) => fn(_get(v), i));
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
    const { _get } = this;
    return this.indexMap.reduce((acc, v, i) => fn(acc, _get(v), i), init);
  }

  lazyReduce<U>(fn: (acc: U, v: () => T, i: number) => U, init: U) {
    const { _get } = this;
    let currIndex = 0;
    const get = () => _get(currIndex);
    return this.indexMap.reduce((acc, v, i) => {
      currIndex = v;
      return fn(acc, get, i);
    }, init);
  }

  reduceRight<U>(fn: (acc: U, v: T, i: number) => U, init: U) {
    const { _get } = this;
    return this.indexMap.reduceRight((acc, v, i) => fn(acc, _get(v), i), init);
  }

  lazyReduceRight<U>(fn: (acc: U, v: () => T, i: number) => U, init: U) {
    const { _get } = this;
    let currIndex = 0;
    const get = () => _get(currIndex);
    return this.indexMap.reduceRight((acc, v, i) => {
      currIndex = v;
      return fn(acc, get, i);
    }, init);
  }

  reverse() {
    return new LazyArray(this._get, this.indexMap.slice().reverse());
  }

  slice(start?: number, end?: number) {
    return new LazyArray(this._get, this.indexMap.slice(start, end));
  }

  duplicate(copies = 2) {
    const n = this.indexMap.length;
    const duplicated = new Int32Array(n * copies);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < copies; j++) {
        duplicated[i * copies + j] = this.indexMap[i];
      }
    }
    return new LazyArray(this._get, duplicated);
  }

  filter(fn: (v: T, i: number) => any) {
    const { _get } = this;
    const filtered = this.indexMap.filter((v, i) => fn(_get(v), i));
    return new LazyArray(_get, filtered);
  }

  sort(compare: (a: T, b: T) => number) {
    const { _get } = this;
    const sorted = this.indexMap
      .slice()
      .sort((i, j) => compare(_get(i), _get(j)));
    return new LazyArray(_get, sorted);
  }

  eagerEvaluate(Arr: ArrayConstructor<T> = Array) {
    return new LazyArray(this.copyTo(Arr));
  }

  findAll<U = any>(
    target: LazyArray<U>,
    matchFn: (a: U, b: T, i: number) => boolean
  ) {
    const indexMap = target
      .map(u => this.findIndex((v, i) => matchFn(u, v, i)))
      .copyTo(Int32Array);
    return new LazyArray(this._get, indexMap);
  }

  dropNull() {
    const filtered = this.indexMap.filter(i => i >= 0);
    return new LazyArray(this._get, filtered);
  }

  get proxy() {
    return this._proxy;
  }

  get length() {
    return this.indexMap.length;
  }

  toString() {
    return this.copyTo(Array).toString();
  }

  [CUSTOM_INSPECT_SYMBOL]() {
    return this.copyTo(Array);
  }

  static dropNull(...arrays: LazyArray[]) {
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
      return new LazyArray(arr._get, indexMap);
    });
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
        ? (this.nestedMap(nested, fn) as LazyArray<U>)
        : fn(nested, i);
    });
  }

  static nestedReduce<T, U>(
    arr: LazyArray<T | LazyArray<T>>,
    fn: (acc: U, v: T, i: number) => U,
    fn2: (acc: U, v: U, i: number) => U,
    init: U
  ): U {
    return arr.reduce(
      (acc, v, i) =>
        v instanceof LazyArray
          ? fn2(acc, this.nestedReduce(v, fn, fn2, init), i)
          : fn(acc, v, i),
      init
    );
  }

  static nestedLazyReduce<T, U>(
    arr: LazyArray<T | LazyArray<T>>,
    fn: (acc: U, v: () => T | U, i: number) => U,
    init: U
  ): U {
    return arr.lazyReduce((acc, getNested, i) => {
      return fn(
        acc,
        () => {
          const nested = getNested();
          return nested instanceof LazyArray
            ? this.nestedLazyReduce(nested, fn, init)
            : nested;
        },
        i
      );
    }, init);
  }

  static nestedFilter<T>(
    arr: LazyArray<T | LazyArray<T>>,
    fn: (v: T, i: number) => boolean
  ): LazyArray<T | LazyArray<T>> {
    return arr
      .filter((nested, i) => nested instanceof LazyArray || fn(nested, i))
      .map(nested => {
        return nested instanceof LazyArray
          ? (this.nestedFilter(nested, fn) as LazyArray<T>)
          : nested;
      });
  }

  static iterateNested<T>(
    arr: LazyArray<T | LazyArray<T>>,
    filter: (v: T) => boolean = () => true,
    yieldFromLevel = 0
  ) {
    function* _iterate(
      arr: LazyArray<T | LazyArray<T>>,
      yieldFromLevel: number,
      acc: { index: number }
    ): IterableIterator<[T, number]> {
      for (const nested of arr) {
        if (nested instanceof LazyArray) {
          yield* _iterate(nested, yieldFromLevel - 1, acc);
        } else {
          if (yieldFromLevel <= 0 && filter(nested)) {
            yield [nested, acc.index];
            acc.index++;
          }
        }
        if (yieldFromLevel === 0) acc.index = 0;
      }
    }

    return {
      [Symbol.iterator]() {
        return _iterate(arr, yieldFromLevel, { index: 0 });
      },
      get values() {
        const iter = this;
        return {
          *[Symbol.iterator]() {
            for (const [v] of iter) {
              yield v;
            }
          }
        };
      },
      get startIndices() {
        const iter = this;
        return {
          *[Symbol.iterator]() {
            let index = 0;
            for (const [_, i] of iter) {
              if (i === 0) yield index;
              index++;
            }
          }
        };
      },
      eagerEvaluate() {
        const values = [];
        const startIndices = [];
        let index = 0;
        for (const [v, i] of this) {
          if (i === 0) startIndices.push(index);
          values.push(v);
          index++;
        }
        return { values, startIndices };
      }
    };
  }

  static getNestedSize<T>(
    arr: LazyArray<T | LazyArray<T>>,
    filter: (v: T) => boolean = () => true
  ) {
    return this.nestedReduce(
      arr,
      (acc, v) => acc + (filter(v) ? 1 : 0),
      (acc, u) => acc + u,
      0
    );
  }

  static getNestedDepth<T>(arr: LazyArray<T | LazyArray<T>>) {
    return this.nestedReduce(
      arr,
      acc => acc,
      (acc, u) => Math.max(acc, u + 1),
      0
    );
  }

  static with(arr: LazyArray) {
    return new WithLazyArray(arr);
  }
}

class WithLazyArray<T> {
  withArr: LazyArray<T>;

  constructor(withArr: LazyArray<T>) {
    this.withArr = withArr;
  }

  index<U = any>(target: LazyArray<U>) {
    const index = this.withArr.indexMap;
    return this._apply(target, index);
  }

  find<U = any>(target: LazyArray<U>, fn: (v: T, i: number) => boolean) {
    const index = this.withArr.findIndex(fn);
    return this._apply(target, index);
  }

  filter<U = any>(target: LazyArray<U>, fn: (v: T, i: number) => boolean) {
    const { indexMap } = this.withArr.filter(fn);
    return this._apply(target, indexMap);
  }

  sort<U = any>(target: LazyArray<U>, compare: (a: T, b: T) => number) {
    const { indexMap } = this.withArr.sort(compare);
    return this._apply(target, indexMap);
  }

  private _apply<U = any>(target: LazyArray<U>, index: number | Int32Array) {
    return typeof index === 'number'
      ? target._get(index)
      : new LazyArray(target._get, index);
  }
}

export type NestedLazyArray<T> = LazyArray<T | LazyArray<T>>;

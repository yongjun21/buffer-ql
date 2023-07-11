const INDEX_KEY = Symbol('index');

let defaultMapping = new Int32Array(1);

export function getDefaultIndexMap(n) {
  if (n <= defaultMapping.length) return defaultMapping.subarray(0, n);
  defaultMapping = new Int32Array(2 * n);
  for (let i = 0; i < defaultMapping.length; i++) defaultMapping[i] = i;
  Object.freeze(defaultMapping.buffer);
  return defaultMapping.subarray(0, n);
}

export class WithIndexMap {
  constructor(
    arr,
    indexMap = getDefaultIndexMap(getMaxLength(arr)),
    nullValue = undefined
  ) {
    this.ref = arr;
    this.indexMap = indexMap;
    this._iter = getDefaultIndexMap(indexMap.length);

    if (Array.isArray(arr) || ArrayBuffer.isView(arr)) {
      this.get = i => arr[indexMap[i]] ?? nullValue;
    } else {
      nullValue = nullValue === undefined ? {} : nullValue;
      const el = {};
      Object.defineProperty(el, INDEX_KEY, {
        value: 0,
        writable: true,
        enumerable: false
      });
      Object.entries(arr).forEach(([key, value]) => {
        Object.defineProperty(el, key, {
          get() {
            return value[this[INDEX_KEY]] ?? nullValue[key];
          },
          enumerable: true
        });
      });
      this.get = i => {
        el[INDEX_KEY] = indexMap[i];
        return el;
      };
    }

    const get = (_, prop) => {
      if (prop in this) return this[prop];
      if (prop === 'toLocaleString') return () => 'WithIndexMap Proxy';
      return this.get(prop);
    };
    this._proxy = new Proxy(this.ref, { get });
  }

  *[Symbol.iterator]() {
    for (const i of this._iter) {
      yield this.get(i);
    }
  }

  forEach(fn) {
    return this._iter.forEach(i => fn(this.get(i), i));
  }

  map(fn) {
    const output = new this.ref.constructor(this.indexMap.length);
    for (const i of this._iter) {
      output[i] = fn(this.get(i), i);
    }
    return output;
  }

  every(fn) {
    return this._iter.every(i => fn(this.get(i), i));
  }

  some(fn) {
    return this._iter.some(i => fn(this.get(i), i));
  }

  find(fn) {
    return this._iter.find(i => fn(this.get(i), i));
  }

  findIndex(fn) {
    return this._iter.findIndex(i => fn(this.get(i), i));
  }

  findLast(fn) {
    return this._iter.findLast(i => fn(this.get(i), i));
  }

  findLastIndex(fn) {
    return this._iter.findLastIndex(i => fn(this.get(i), i));
  }

  indexOf(value, fromIndex) {
    const n = this.indexMap.length;
    for (let i = fromIndex; i < n; i++) {
      if (this.get(i) === value) return i;
    }
    return -1;
  }

  lastIndexOf(value, fromIndex) {
    for (let i = fromIndex; i >= 0; i--) {
      if (this.get(i) === value) return i;
    }
    return -1;
  }

  includes(value, fromIndex) {
    const n = this.indexMap.length;
    for (let i = fromIndex; i < n; i++) {
      if (this.get(i) === value) return true;
    }
    return false;
  }

  reduce(fn, init) {
    return this._iter.reduce((acc, i) => fn(acc, this.get(i), i), init);
  }

  reduceRight(fn, init) {
    return this._iter.reduceRight((acc, i) => fn(acc, this.get(i), i), init);
  }

  reverse() {
    return new WithIndexMap(this.ref, this.indexMap.toReversed());
  }

  slice(start, end) {
    return new WithIndexMap(this.ref, this.indexMap.slice(start, end));
  }

  filter(fn) {
    const filtered = this.indexMap.filter((_, i) => fn(this.get(i), i));
    return new WithIndexMap(this.ref, filtered);
  }

  sort(compare) {
    const n = this.indexMap.length;
    const mapping = new Int32Array(n);
    for (const i of this._iter) mapping[i] = i;

    const stack = [];
    stack.push(0, n - 1);

    while (stack.length > 0) {
      const end = stack.pop();
      const start = stack.pop();

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

    return new WithIndexMap(this.ref, mapping.subarray(0, n));
  }

  lookup(target) {
    if (!target.indexMap) target = new WithIndexMap(target);
    const targetIndexMap = this._iter.map(i => target.indexOf(this.get(i)));
    return new WithIndexMap(target.ref, targetIndexMap);
  }

  values() {
    if (Array.isArray(this.ref) || ArrayBuffer.isView(this.ref)) {
      const arr = new this.ref.constructor(this.indexMap.length);
      for (const i of this._iter) arr[i] = this.get(i);
      return arr;
    } else {
      return Object.fromEntries(
        Object.keys(this.ref).map(key => {
          const arr = new this.ref[key].constructor(this.indexMap.length);
          for (const i of this._iter) arr[i] = this.get(i)[key];
          return [key, arr];
        })
      );
    }
  }

  get proxy() {
    return this._proxy;
  }

  get length() {
    return this.indexMap.length;
  }

  static dropNull(...arrays) {
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
      return new WithIndexMap(arr.ref, indexMap)
    });
  }
}

function getMaxLength(arr) {
  if (Array.isArray(arr) || ArrayBuffer.isView(arr)) return arr.length;
  let max = 0;
  Object.values(arr).forEach(v => {
    if (v.length > max) max = v.length;
  });
  return max;
}

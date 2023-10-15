import type { ArrayLike } from '../types/common.d.ts';

export function typed<T>(v: T) {
  return v;
}

// check that works with arrays, typed arrays and their proxies
export function isArray(arr: any): arr is ArrayLike<any> {
  return (
    Array.isArray(arr) ||
    arr instanceof Float32Array ||
    arr instanceof Float64Array ||
    arr instanceof Int8Array ||
    arr instanceof Int16Array ||
    arr instanceof Int32Array ||
    arr instanceof Uint8Array ||
    arr instanceof Uint8ClampedArray ||
    arr instanceof Uint16Array ||
    arr instanceof Uint32Array
  );
}

export class Stack<T = any> {
  container: ArrayLike<T>
  pointer: number

  constructor(container: ArrayLike<T>) {
    this.container = container;
    this.pointer = -1;
  }

  push(item: T) {
    this.container[++this.pointer] = item;
  }

  pop() {
    return this.container[this.pointer--];
  }

  peek() {
    return this.container[this.pointer];
  }

  get size() {
    return this.pointer + 1;
  }

  get isEmpty() {
    return this.pointer < 0;
  }

  get isFull() {
    return this.pointer >= this.container.length;
  }
}

type Comparator<T> = (a: T, b: T) => number

export class MinHeap<T> {
  _data: T[]
  _comparator: Comparator<T>

  constructor (comparator: Comparator<T> = ((a, b) => a - b) as Comparator<any>) {
    this._data = []
    this._comparator = comparator
  }

  push (...values: T[]) {
    for (const v of values) {
      let cIndex = this._data.push(v) - 1
      while (cIndex > 0) {
        const pIndex = Math.floor((cIndex - 1) / 2)
        if (this._swap(pIndex, cIndex)) cIndex = pIndex
        else break
      }
    }
    return this
  }

  pop () {
    if (this._data.length <= 1) return this._data.pop()
    const min = this._data[0]
    this._data[0] = this._data.pop()!
    this._heapify(0)
    return min
  }

  peek () {
    return this._data[0]
  }

  _swap (pIndex: number, cIndex: number) {
    const parent = this._data[pIndex]
    const child = this._data[cIndex]
    if (this._comparator(child, parent) < 0) {
      this._data[pIndex] = child
      this._data[cIndex] = parent
      return true
    }
    return false
  }

  _heapify (pIndex: number) {
    while (true) {
      const lIndex = pIndex * 2 + 1
      const rIndex = lIndex + 1
      if (lIndex >= this._data.length) break
      let mIndex = lIndex
      if (rIndex < this._data.length) {
        const left = this._data[lIndex]
        const right = this._data[rIndex]
        if (this._comparator(right, left) < 0) mIndex = rIndex
      }
      if (this._swap(pIndex, mIndex)) pIndex = mIndex
      else break
    }
  }

  get size () {
    return this._data.length
  }

  * [Symbol.iterator] () {
    while (this.size > 0) yield this.pop()
  }
}

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

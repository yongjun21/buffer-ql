import type { ArrayLike } from '../types/common.d.ts';

const textDecoder = new TextDecoder();

export function typed<T>(v: T) {
  return v;
}

export function readString(dv: DataView, offset: number) {
  const _offset = dv.getFloat32(offset, true);
  const _length = dv.getFloat32(offset + 4, true);
  return textDecoder.decode(new Uint8Array(dv.buffer, _offset, _length));
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

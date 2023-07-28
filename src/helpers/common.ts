interface ArrayLike<T> {
  length: number;
  [n: number]: T;
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

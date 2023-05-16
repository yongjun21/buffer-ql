export class Stack {
    constructor(container) {
      this.container = container;
      this.pointer = -1;
    }
  
    push(item) {
      this.container[++this.pointer] = item;
    }
  
    pop() {
      return this.container[this.pointer--];
    }
  
    peek() {
      return this.conatiner[this.pointer];
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

/* eslint-disable no-labels */

import { MinHeap, Stack } from './common.js';

type Int32Indexes = ReturnType<typeof decodeBitmask>;

export function decodeBitmask(encoded: Uint8Array, n: number) {
  return {
    *[Symbol.iterator]() {
      const depth = Math.ceil(Math.log2(n));
      const reader = readBit(encoded);
      const stack = new Stack(new Uint8Array(64));
      stack.push(depth);

      let currIndex = 0;
      while (!stack.isEmpty) {
        if (currIndex >= n) break;

        const next = reader();

        const level = stack.pop();
        if (level === 0) {
          if (next) yield currIndex;
          currIndex++;
        } else if (next) {
          stack.push(level - 1);
          stack.push(level - 1);
        } else {
          currIndex += 1 << level;
        }
      }
    },
    asInt32Array: asInt32Array(n)
  };
}

export function encodeBitmask(iter: Iterable<number>, n: number) {
  const input = iter[Symbol.iterator]();
  const output = new Uint8Array(2 * n);
  const depth = Math.ceil(Math.log2(n));
  const writer = writeBit(output);
  const stack = new Stack(new Uint8Array(64));
  stack.push(depth);

  let length = 0;
  let currIndex = 0;
  let next = input.next();
  if (next.done) return new Uint8Array(1);

  while (!stack.isEmpty) {
    if (currIndex >= n) break;

    const level = stack.pop();
    const leafCount = 1 << level;

    if (next.done) {
      currIndex += leafCount;
      continue;
    }

    if (level === 0) {
      if (next.value === currIndex) {
        length = writer(1);
        next = input.next();
      } else {
        length = writer(0);
      }
      currIndex++;
    } else if (currIndex + leafCount > next.value) {
      length = writer(1);
      stack.push(level - 1);
      stack.push(level - 1);
    } else {
      length = writer(0);
      currIndex += leafCount;
    }
  }

  return output.slice(0, Math.ceil(length / 8));
}

export function bitToIndex(iter: Iterable<any>): Iterable<number> {
  return {
    *[Symbol.iterator]() {
      let index = 0;
      let curr = 0;
      for (const b of iter) {
        if (b !== curr) {
          yield index;
          curr = b;
        }
        index++;
      }
    }
  };
}

export function oneOfToIndex(
  iter: Iterable<number>,
  noOfClass: number
): Iterable<number>[] {
  const iters: Iterable<number>[] = [];
  for (let k = 0; k < noOfClass; k++) {
    iters.push({
      *[Symbol.iterator]() {
        let index = 0;
        let curr = -1;
        for (const n of iter) {
          if (n === k && n !== curr) yield index;
          curr = n;
          index++;
        }
      }
    });
  }
  return iters;
}

export function indexToBit(n: number, decodedBitmask: Iterable<number>) {
  return {
    *[Symbol.iterator]() {
      let index = 0;
      let curr = 0;
      for (const i of decodedBitmask) {
        while (index < i) {
          yield curr;
          index++;
        }
        curr = 1 - curr;
      }
      while (index < n) {
        yield curr;
        index++;
      }
    },
    asUint8Array: asUint8Array(n)
  };
}

export function indexToOneOf(
  n: number,
  ...decodedBitmasks: Iterable<number>[]
) {
  return {
    *[Symbol.iterator]() {
      let index = 0;
      for (const [curr, until] of oneOfLoop(n, decodedBitmasks)) {
        while (index < until) {
          yield curr;
          index++;
        }
      }
    },
    asUint8Array: asUint8Array(n)
  };
}

export function forwardMapIndexes(
  n: number,
  decodedBitmask: Iterable<number>,
  equals = 1
) {
  return {
    *[Symbol.iterator]() {
      let ones = 0;
      let index = 0;
      let curr = 1 - equals;
      for (const i of decodedBitmask) {
        if (curr) {
          while (index < i) {
            yield ones++;
            index++;
          }
        } else {
          while (index < i) {
            yield -1;
            index++;
          }
        }
        curr = 1 - curr;
      }
      if (curr) {
        while (index < n) {
          yield ones++;
          index++;
        }
      } else {
        while (index < n) {
          yield -1;
          index++;
        }
      }
    },
    asInt32Array: asInt32Array(n)
  };
}

export function backwardMapIndexes(
  n: number,
  decodedBitmask: Iterable<number>,
  equals = 1
) {
  return {
    *[Symbol.iterator]() {
      let index = 0;
      let curr = 1 - equals;
      for (const i of decodedBitmask) {
        if (curr) {
          while (index < i) yield index++;
        } else {
          index = i;
        }
        curr = 1 - curr;
      }
      if (curr) {
        while (index < n) yield index++;
      }
    },
    asInt32Array: asInt32Array(n)
  };
}

export function forwardMapSingleIndex(
  decodedBitmask: Iterable<number>,
  index: number,
  equals = 1
) {
  if (index < 0) return -1;
  let zeros = 0;
  let ones = 0;
  let curr = 1 - equals;
  for (const i of decodedBitmask) {
    if (curr) ones = i - zeros;
    else zeros = i - ones;
    if (index < i) break;
    curr = 1 - curr;
  }
  return curr ? index - zeros : -1;
}

export function backwardMapSingleIndex(
  decodedBitmask: Iterable<number>,
  index: number,
  equals = 1
) {
  let zeros = 0;
  let ones = 0;
  let curr = 1 - equals;
  for (const i of decodedBitmask) {
    if (curr) {
      ones = i - zeros;
      if (index < ones) break;
    } else {
      zeros = i - ones;
    }
    curr = 1 - curr;
  }
  return curr ? index + zeros : -1;
}

export function chainForwardIndexes(
  n: number,
  currMapped: Iterable<number>,
  nextMapped: Iterable<number>
) {
  return {
    *[Symbol.iterator]() {
      const iter = nextMapped[Symbol.iterator]();
      for (const i of currMapped) {
        if (i < 0) yield -1;
        else {
          const next = iter.next();
          yield next.done ? -1 : next.value;
        }
      }
    },
    asInt32Array: asInt32Array(n)
  };
}

export function chainBackwardIndexes(
  n: number,
  currMapped: Iterable<number>,
  nextMapped: Iterable<number>
) {
  return {
    *[Symbol.iterator]() {
      const iter = currMapped[Symbol.iterator]();
      let index = 0;
      let next = iter.next();
      for (const i of nextMapped) {
        while (index < i) {
          next = iter.next();
          index++;
          if (next.done) return;
        }
        yield next.value;
      }
    },
    asInt32Array: asInt32Array(n)
  };
}

export function forwardMapOneOf(
  n: number,
  ...decodedBitmasks: Iterable<number>[]
) {
  const forwardMaps: Int32Indexes[] = [];
  for (let k = 0; k < decodedBitmasks.length; k++) {
    forwardMaps.push({
      *[Symbol.iterator]() {
        let ones = 0;
        let index = 0;
        for (const [curr, until] of oneOfLoop(n, decodedBitmasks)) {
          if (curr === k) {
            while (index < until) {
              yield ones++;
              index++;
            }
          } else {
            while (index < until) {
              yield -1;
              index++;
            }
          }
        }
      },
      asInt32Array: asInt32Array(n)
    });
  }
  return forwardMaps;
}

export function backwardMapOneOf(
  n: number,
  ...decodedBitmasks: Iterable<number>[]
) {
  const backwardMaps: Int32Indexes[] = [];
  for (let k = 0; k < decodedBitmasks.length; k++) {
    backwardMaps.push({
      *[Symbol.iterator]() {
        let index = 0;
        for (const [curr, until] of oneOfLoop(n, decodedBitmasks)) {
          if (curr === k) {
            while (index < until) yield index++;
          } else {
            index = until;
          }
        }
      },
      asInt32Array: asInt32Array(n)
    });
  }
  return backwardMaps;
}

export function forwardMapSingleOneOf(
  index: number,
  ...decodedBitmasks: Iterable<number>[]
) {
  if (index < 0) return [0, -1];
  const kMax = decodedBitmasks.length;
  const zeros = new Uint32Array(kMax);
  const ones = new Uint32Array(kMax);
  let lastCurr = -1;
  for (const [curr, until] of oneOfLoop(256, decodedBitmasks)) {
    lastCurr = curr;
    for (let k = 0; k < kMax; k++) {
      if (curr === k) ones[k] = until - zeros[k];
      else zeros[k] = until - ones[k];
    }
    if (index < until) break;
  }
  return [lastCurr, index - zeros[lastCurr]];
}

export function backwardMapSingleOneOf(
  group: number,
  index: number,
  ...decodedBitmasks: Iterable<number>[]
) {
  let zeros = 0;
  let ones = 0;
  let isCurr = false;
  for (const [curr, until] of oneOfLoop(Infinity, decodedBitmasks)) {
    isCurr = curr === group;
    if (isCurr) {
      ones = until - zeros;
      if (index < ones) break;
    } else {
      zeros = until - ones;
    }
  }
  return isCurr ? index + zeros : -1;
}

export function diffIndexes(curr: Iterable<number>, next: Iterable<number>) {
  return {
    *[Symbol.iterator]() {
      const nextIter = next[Symbol.iterator]();
      let nextIndex = nextIter.next();
      for (const currIndex of curr) {
        while (!nextIndex.done && nextIndex.value < currIndex) {
          yield nextIndex.value;
          nextIndex = nextIter.next();
        }
        if (nextIndex.done || nextIndex.value > currIndex) yield currIndex;
        else nextIndex = nextIter.next();
      }
      while (!nextIndex.done) {
        yield nextIndex.value;
        nextIndex = nextIter.next();
      }
    }
  };
}

export function applyIndexDiff(curr: Iterable<number>, diff: Iterable<number>) {
  return {
    *[Symbol.iterator]() {
      const diffIter = diff[Symbol.iterator]();
      let diffIndex = diffIter.next();
      for (const currIndex of curr) {
        while (!diffIndex.done && diffIndex.value < currIndex) {
          yield diffIndex.value;
          diffIndex = diffIter.next();
        }
        if (diffIndex.done || diffIndex.value > currIndex) yield currIndex;
        else diffIndex = diffIter.next();
      }
    }
  };
}

function* oneOfLoop(n: number, decodedBitmasks: Iterable<number>[]) {
  const iters = decodedBitmasks.map(iter => iter[Symbol.iterator]());

  const heap = new MinHeap<[number, number]>((a, b) => a[0] - b[0]);
  iters.forEach((iter, k) => {
    const next = iter.next();
    heap.push([next.done ? n : next.value, k]);
  });

  let [_, curr] = heap.pop()!;
  const next = iters[curr].next();
  heap.push([next.done ? n : next.value, curr]);

  while (true) {
    const [minIndex, minK] = heap.pop()!;
    if (minIndex === n) break;

    const next = iters[minK].next();
    heap.push([next.done ? n : next.value, minK]);

    yield [minK, minIndex];
    curr = minK;
  }

  yield [curr, n];
}

function readBit(arr: Uint8Array) {
  let index = 0;
  let position = 0;
  return () => {
    if (index >= arr.length) return 0;
    const value = arr[index];
    const mask = 1 << position;
    position++;
    if (position >= 8) {
      index++;
      position = 0;
    }
    return value & mask ? 1 : 0;
  };
}

function writeBit(arr: Uint8Array) {
  let n = 0;
  let index = 0;
  let position = 0;
  return (v: number) => {
    if (index >= arr.length) return n;
    const mask = 1 << position;
    arr[index] += mask * (v ? 1 : 0);
    n++;
    position++;
    if (position >= 8) {
      index++;
      position = 0;
    }
    return n;
  };
}

export function asUint8Array(n: number) {
  return function (this: Iterable<number>) {
    const output = new Uint8Array(n);
    let k = 0;
    for (const i of this) {
      if (k >= n) break;
      output[k++] = i;
    }
    return output.slice(0, k);
  };
}

export function asInt32Array(n: number) {
  return function (this: Iterable<number>) {
    const output = new Int32Array(n);
    let k = 0;
    for (const i of this) {
      if (k >= n) break;
      output[k++] = i;
    }
    return output.slice(0, k);
  };
}

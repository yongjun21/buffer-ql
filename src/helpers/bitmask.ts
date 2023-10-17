/* eslint-disable no-labels */

import { MinHeap, Stack } from './common.js';

export function decodeBitmask(encoded: Uint8Array, n: number) {
  return {
    *[Symbol.iterator]() {
      const depth = Math.ceil(Math.log2(n));
      const reader = getBitReader(encoded);
      const stack = new Stack(new Uint8Array(64));
      stack.push(depth);

      let currIndex = 0;
      while (!stack.isEmpty) {
        if (currIndex >= n) break;

        const next = reader.read();

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
  };
}

export function encodeBitmask(iter: Iterable<number>, n: number) {
  const output = new Uint8Array(2 * n);
  const writer = getBitWriter(output);
  const encoder = getBitmaskEncoder(writer, n);
  encoder.next();

  for (const i of iter) encoder.next(i);

  return writer.length > 0 ? output.slice(0, writer.length) : new Uint8Array(1);
}

export function encodeOneOf(
  iter: Iterable<number>,
  n: number,
  noOfClass: number
) {
  const outputs: Uint8Array[] = [];
  for (let k = 0; k < noOfClass; k++) outputs.push(new Uint8Array(2 * n));
  const writers = outputs.map(getBitWriter);
  const encoders = writers.map(writer => getBitmaskEncoder(writer, n));
  encoders.forEach(encoder => encoder.next());

  let index = 0;
  let curr = -1;
  for (const i of iter) {
    if (curr < 0) {
      curr = i;
      continue;
    }
    encoders[curr].next(index);
    index = i;
    curr = -1;
  }

  return outputs.map((output, k) =>
    writers[k].length > 0
      ? output.slice(0, writers[k].length)
      : new Uint8Array(1)
  );
}

function* getBitmaskEncoder(
  writer: ReturnType<typeof getBitWriter>,
  n: number
): Generator<void, void, number> {
  const depth = Math.ceil(Math.log2(n));
  const stack = new Stack(new Uint8Array(64));
  stack.push(depth);

  let currIndex = 0;
  let next = yield;

  while (!stack.isEmpty) {
    if (currIndex >= n) break;

    const level = stack.pop();
    const leafCount = 1 << level;

    if (level === 0) {
      if (next === currIndex) {
        writer.write(1);
        next = yield;
      } else {
        writer.write(0);
      }
      currIndex++;
    } else if (currIndex + leafCount > next) {
      writer.write(1);
      stack.push(level - 1);
      stack.push(level - 1);
    } else {
      writer.write(0);
      currIndex += leafCount;
    }
  }
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
    },
  };
}

export function oneOfToIndex(iter: Iterable<number>): Iterable<number> {
  return {
    *[Symbol.iterator]() {
      let index = 0;
      let curr = -1;
      for (const k of iter) {
        if (k !== curr) {
          if (index > 0) yield index;
          yield k;
          curr = k;
        }
        index++;
      }
      if (index > 0) yield index;
    }
  };
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
  };
}

export function indexToOneOf(decodedOneOf: Iterable<number>) {
  return {
    *[Symbol.iterator]() {
      let index = 0;
      let curr = -1;
      for (const i of decodedOneOf) {
        if (curr < 0) {
          curr = i;
          continue;
        }
        while (index < i) {
          yield curr;
          index++;
        }
        curr = -1;
      }
    },
  };
}

export function splitOneOfIndexes(iter: Iterable<number>, noOfClass: number) {
  const iters: Iterable<number>[] = [];
  for (let k = 0; k < noOfClass; k++) {
    iters.push({
      *[Symbol.iterator]() {
        let index = 0;
        let curr = -1;
        for (const i of iter) {
          if (curr < 0) {
            curr = i;
            continue;
          }
          if (curr === k) yield index;
          index = i;
          curr = -1;
        }
      }
    });
  }
  return iters;
}

export function mergeOneOfIndexes(n: number, ...indexes: Iterable<number>[]) {
  return {
    *[Symbol.iterator]() {
      const iters = indexes.map(index => index[Symbol.iterator]());

      const heap = new MinHeap<[number, number]>((a, b) => a[0] - b[0]);
      iters.forEach((iter, k) => {
        const next = iter.next();
        heap.push([next.done ? n : next.value, k]);
      });

      let [_, curr] = heap.pop()!;
      const next = iters[curr].next();
      heap.push([next.done ? n : next.value, curr]);

      while (heap.size > 0) {
        const [minIndex, minK] = heap.pop()!;
        if (minIndex === n) break;

        const next = iters[minK].next();
        heap.push([next.done ? n : next.value, minK]);

        yield curr;
        yield minIndex;
        curr = minK;
      }

      yield curr;
      yield n;
    }
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
  };
}

export function forwardMapSingleIndex(
  index: number,
  decodedBitmask: Iterable<number>,
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
  index: number,
  decodedBitmask: Iterable<number>,
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
  };
}

export function chainBackwardIndexes(
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
  };
}

export function forwardMapOneOf(
  decodedOneOf: Iterable<number>,
  noOfClass: number
) {
  const forwardMaps: Iterable<number>[] = [];
  for (let k = 0; k < noOfClass; k++) {
    forwardMaps.push({
      *[Symbol.iterator]() {
        let ones = 0;
        let index = 0;
        let curr = -1;
        for (const i of decodedOneOf) {
          if (curr < 0) {
            curr = i;
            continue;
          }
          if (curr === k) {
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
          curr = -1;
        }
      },
    });
  }
  return forwardMaps;
}

export function backwardMapOneOf(
  decodedOneOf: Iterable<number>,
  noOfClass: number
) {
  const backwardMaps: Iterable<number>[] = [];
  for (let k = 0; k < noOfClass; k++) {
    backwardMaps.push({
      *[Symbol.iterator]() {
        let index = 0;
        let curr = -1;
        for (const i of decodedOneOf) {
          if (curr < 0) {
            curr = i;
            continue;
          }
          if (curr === k) {
            while (index < i) yield index++;
          } else {
            index = i;
          }
          curr = -1;
        }
      },
    });
  }
  return backwardMaps;
}

export function forwardMapSingleOneOf(
  index: number,
  decodedOneOf: Iterable<number>,
  noOfClass: number
) {
  if (index < 0) return [0, -1];
  const zeros = new Uint32Array(noOfClass);
  const ones = new Uint32Array(noOfClass);
  let curr = -1;
  for (const i of decodedOneOf) {
    if (curr < 0) {
      curr = i;
      continue;
    }
    for (let k = 0; k < noOfClass; k++) {
      if (curr === k) ones[k] = i - zeros[k];
      else zeros[k] = i - ones[k];
    }
    if (index < i) break;
    curr = -1;
  }
  return [curr, index - zeros[curr]];
}

export function backwardMapSingleOneOf(
  index: number,
  decodedOneOf: Iterable<number>,
  group: number
) {
  let zeros = 0;
  let ones = 0;
  let curr = -1;
  for (const i of decodedOneOf) {
    if (curr < 0) {
      curr = i;
      continue;
    }
    if (curr === group) {
      ones = i - zeros;
      if (index < ones) break;
    } else {
      zeros = i - ones;
    }
    curr = -1;
  }
  return curr === group ? index + zeros : -1;
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

function getBitReader(arr: Uint8Array) {
  let index = 0;
  let position = 0;
  return {
    read() {
      if (index >= arr.length) return 0;
      const value = arr[index];
      const mask = 1 << position;
      position++;
      if (position >= 8) {
        index++;
        position = 0;
      }
      return value & mask ? 1 : 0;
    }
  };
}

function getBitWriter(arr: Uint8Array) {
  let index = 0;
  let position = 0;
  return {
    write(v: number) {
      if (index >= arr.length) return;
      const mask = 1 << position;
      arr[index] += mask * (v ? 1 : 0);
      position++;
      if (position >= 8) {
        index++;
        position = 0;
      }
    },
    get length() {
      return index + (position > 0 ? 1 : 0);
    }
  };
}

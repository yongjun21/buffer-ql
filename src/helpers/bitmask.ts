/* eslint-disable no-labels */

import { Stack } from './common.js';

export function decodeBitmask(
  encoded: Uint8Array,
  maxIndex: number
): Iterable<number> {
  return {
    *[Symbol.iterator]() {
      const n = maxIndex + 1;
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
    }
  };
}

export function encodeBitmask(iter: Iterable<number>, maxIndex: number) {
  const n = maxIndex + 1;
  const input = iter[Symbol.iterator]();
  const output = new Uint8Array(2 * n);
  const writer = getBitWriter(output);

  const depth = Math.ceil(Math.log2(n));
  const stack = new Stack(new Uint8Array(64));
  stack.push(depth);

  let currIndex = 0;
  let nextIndex = input.next();

  while (!stack.isEmpty) {
    if (currIndex >= n || nextIndex.done) break;

    const level = stack.pop();
    const leafCount = 1 << level;

    if (level === 0) {
      if (nextIndex.value === currIndex) {
        writer.write(1);
        nextIndex = input.next();
      } else {
        writer.write(0);
      }
      currIndex++;
    } else if (currIndex + leafCount > nextIndex.value) {
      writer.write(1);
      stack.push(level - 1);
      stack.push(level - 1);
    } else {
      writer.write(0);
      currIndex += leafCount;
    }
  }

  return writer.length > 0 ? output.slice(0, writer.length) : new Uint8Array(1);
}

export function decodeOneOf(
  encoded: Uint8Array,
  maxIndex: number,
  noOfClass: number
): Iterable<number> {
  const n = maxIndex * noOfClass + noOfClass - 1;
  return decodeBitmask(encoded, n);
}

export function encodeOneOf(
  iter: Iterable<number>,
  maxIndex: number,
  noOfClass: number
) {
  const n = maxIndex * noOfClass + noOfClass - 1;
  return encodeBitmask(iter, n);
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
      yield index;
    }
  };
}

export function oneOfToIndex(
  iter: Iterable<number>,
  noOfClass: number
): Iterable<number> {
  return {
    *[Symbol.iterator]() {
      let index = 0;
      let curr = -1;
      for (const k of iter) {
        if (k !== curr) {
          if (index > 0) yield index * noOfClass + curr;
          curr = k;
        }
        index++;
      }
      if (index > 0) yield index * noOfClass + curr;
    }
  };
}

export function indexToBit(decodedBitmask: Iterable<number>): Iterable<number> {
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
    }
  };
}

export function indexToOneOf(
  decodedOneOf: Iterable<number>,
  noOfClass: number
): Iterable<number> {
  return {
    *[Symbol.iterator]() {
      let index = 0;
      for (const _i of decodedOneOf) {
        const curr = _i % noOfClass;
        const i = Math.trunc(_i / noOfClass);
        while (index < i) {
          yield curr;
          index++;
        }
      }
    }
  };
}

export function forwardMapIndexes(
  decodedBitmask: Iterable<number>,
  equals = 1
): Iterable<number> {
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
    }
  };
}

export function backwardMapIndexes(
  decodedBitmask: Iterable<number>,
  equals = 1
): Iterable<number> {
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
    }
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
): Iterable<number> {
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
    }
  };
}

export function chainBackwardIndexes(
  currMapped: Iterable<number>,
  nextMapped: Iterable<number>
): Iterable<number> {
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
    }
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
        for (const _i of decodedOneOf) {
          const curr = _i % noOfClass;
          const i = Math.trunc(_i / noOfClass);
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
        }
      }
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
        for (const _i of decodedOneOf) {
          const curr = _i % noOfClass;
          const i = Math.trunc(_i / noOfClass);
          if (curr === k) {
            while (index < i) yield index++;
          } else {
            index = i;
          }
        }
      }
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
  for (const _i of decodedOneOf) {
    curr = _i % noOfClass;
    const i = Math.trunc(_i / noOfClass);
    for (let k = 0; k < noOfClass; k++) {
      if (curr === k) ones[k] = i - zeros[k];
      else zeros[k] = i - ones[k];
    }
    if (index < i) break;
  }
  return [curr, index - zeros[curr]];
}

export function backwardMapSingleOneOf(
  index: number,
  group: number,
  decodedOneOf: Iterable<number>,
  noOfClass: number
) {
  let zeros = 0;
  let ones = 0;
  let curr = -1;
  for (const _i of decodedOneOf) {
    curr = _i % noOfClass;
    const i = Math.trunc(_i / noOfClass);
    if (curr === group) {
      ones = i - zeros;
      if (index < ones) break;
    } else {
      zeros = i - ones;
    }
  }
  return curr === group ? index + zeros : -1;
}

export function diffIndexes(
  curr: Iterable<number>,
  next: Iterable<number>
): Iterable<number> {
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

export function diffOneOfs(
  curr: Iterable<number>,
  next: Iterable<number>,
  noOfClass: number
): Iterable<number> {
  return {
    *[Symbol.iterator]() {
      const currIter = curr[Symbol.iterator]();
      let _curr = currIter.next();

      let lastK = -1;
      let startIndex = 0;
      let endIndex = 0;
      const getNextYield = (nextK: number, nextI: number) => {
        let nextYield: number | undefined;
        if (lastK === nextK) {
          endIndex = nextI;
        } else {
          if (endIndex > startIndex) {
            if (lastK < 0) nextYield = -endIndex;
            else nextYield = endIndex * noOfClass + lastK;
          }
          startIndex = endIndex;
          endIndex = nextI;
          lastK = nextK;
        }
        return nextYield;
      }

      for (const _next of next) {
        const nextK = _next % noOfClass;
        const nextI = Math.trunc(_next / noOfClass);
        while (!_curr.done && _curr.value < _next) {
          const currK = _curr.value % noOfClass;
          const currI = Math.trunc(_curr.value / noOfClass);
          const nextYield = getNextYield(currK === nextK ? -1 : nextK, currI);
          if (nextYield != null) yield nextYield;
          _curr = currIter.next();
        }
        if (_curr.done) {
          const nextYield = getNextYield(nextK, nextI);
          if (nextYield != null) yield nextYield;
        } else {
          const currK = _curr.value % noOfClass;
          const nextYield = getNextYield(currK === nextK ? -1 : nextK, nextI);
          if (nextYield != null) yield nextYield;
          if (_curr.value === _next) _curr = currIter.next();
        }
      }
      if (endIndex > startIndex) {
        if (lastK < 0) yield -endIndex;
        else yield endIndex * noOfClass + lastK;
      }
    }
  }
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

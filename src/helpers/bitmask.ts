/* eslint-disable no-labels */

import { Stack } from './common.js';

const POWER2 = new Uint32Array(32).map((_, i) => Math.pow(2, i));

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
          currIndex += POWER2[level] || Math.pow(2, level);
        }
      }
    }
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
    const leafCount = POWER2[level] || Math.pow(2, level);

    if (next.done) {
      length = writer(0);
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

export function bitToIndex(iter: Iterable<any>) {
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

export function indexToBit(decodedBitmask: Iterable<number>, n: number) {
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
    }
  };
}

export function forwardMapIndexes(
  decodedBitmask: Iterable<number>,
  n: number,
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
    }
  };
}

export function backwardMapIndexes(
  decodedBitmask: Iterable<number>,
  n: number,
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
    }
  };
}

export function forwardMapSingleIndex(
  decodedBitmask: Iterable<number>,
  index: number,
  equals = 1
) {
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
    }
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
    }
  };
}

export function forwardMapOneOf(n: number, ...bitmasks: Uint8Array[]) {
  const iters = bitmasks.map(b => indexToBit(decodeBitmask(b, n), n));
  const forwardMaps: Iterable<number>[] = [];
  const kMax = bitmasks.length;

  forwardMaps.push({
    *[Symbol.iterator]() {
      const _iters = iters.map(iter => iter[Symbol.iterator]());
      loop: while (true) {
        for (let k = 0; k < kMax; k++) {
          const next = _iters[k].next();
          if (next.done) break loop;
          if (!next.value) {
            yield k;
            break;
          } else if (k >= kMax - 1) {
            yield kMax;
          }
        }
      }
    }
  });

  for (let kn = 0; kn < kMax; kn++) {
    forwardMaps.push({
      *[Symbol.iterator]() {
        const _iters = iters
          .slice(0, kn + 1)
          .map(iter => iter[Symbol.iterator]());
        let index = 0;
        loop: while (true) {
          for (let k = 0; k <= kn; k++) {
            const next = _iters[k].next();
            if (next.done) break loop;
            if (k < kn) {
              if (!next.value) {
                yield -1;
                break;
              }
            } else {
              yield next.value ? -1 : index++;
            }
          }
        }
      }
    });
  }

  forwardMaps.push({
    *[Symbol.iterator]() {
      const _iters = iters.map(iter => iter[Symbol.iterator]());
      let index = 0;
      loop: while (true) {
        for (let k = 0; k < kMax; k++) {
          const next = _iters[k].next();
          if (next.done) break loop;
          if (k < kMax - 1) {
            if (!next.value) {
              yield -1;
              break;
            }
          } else {
            yield next.value ? index++ : -1;
          }
        }
      }
    }
  });

  return forwardMaps;
}

export function backwardMapOneOf(n: number, ...bitmasks: Uint8Array[]) {
  const iters = bitmasks.map(b => indexToBit(decodeBitmask(b, n), n));
  const backwardMaps: Iterable<number>[] = [];
  const kMax = bitmasks.length;

  for (let kn = 0; kn < kMax; kn++) {
    backwardMaps.push({
      *[Symbol.iterator]() {
        const _iters = iters
          .slice(0, kn + 1)
          .map(iter => iter[Symbol.iterator]());
        let index = 0;
        loop: while (true) {
          for (let k = 0; k <= kn; k++) {
            const next = _iters[k].next();
            if (next.done) break loop;
            if (k < kn) {
              if (!next.value) break;
            } else if (!next.value) {
              yield index;
            }
          }
          index++;
        }
      }
    });
  }

  backwardMaps.push({
    *[Symbol.iterator]() {
      const _iters = iters.map(iter => iter[Symbol.iterator]());
      let index = 0;
      loop: while (true) {
        for (let k = 0; k < kMax; k++) {
          const next = _iters[k].next();
          if (next.done) break loop;
          if (k < kMax - 1) {
            if (!next.value) break;
          } else if (next.value) {
            yield index;
          }
        }
        index++;
      }
    }
  });

  return backwardMaps;
}

export function forwardMapSingleOneOf(
  index: number,
  ...bitmasks: Uint8Array[]
) {
  return [0, index];
}

function readBit(arr: Uint8Array) {
  let index = 0;
  let position = 0;
  return () => {
    if (index >= arr.length) return 0;
    const value = arr[index];
    const mask = POWER2[position];
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
    const mask = POWER2[position];
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

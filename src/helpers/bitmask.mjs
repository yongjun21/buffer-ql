import { Stack } from "./common.mjs";

const POWER2 = new Uint32Array(32).map((_, i) => Math.pow(2, i));

const decodeStackContainer = new Uint8Array(64);
const encodeStackContainer = new Uint8Array(64);

export function decodeBitmask(encoded, n) {
  return {
    *[Symbol.iterator]() {
      const depth = Math.ceil(Math.log2(n));
      const reader = readBit(encoded);
      const stack = new Stack(decodeStackContainer);
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
    },
  };
}

export function encodeBitmask(iter, n) {
  const input = iter[Symbol.iterator]();
  const output = new Uint8Array(2 * n);
  const depth = Math.ceil(Math.log2(n));
  const writer = writeBit(output);
  const stack = new Stack(encodeStackContainer);
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

export function* bitToIndex(iter) {
  let index = 0;
  let curr = 1;
  for (const b of iter) {
    if (b !== curr) {
      yield index;
      curr = b;
    }
    index++;
  }
}

export function* indexToBit(iter, n) {
  let index = 0;
  let curr = 1;
  for (const i of iter) {
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

export function forwardMapIndexes(iter, n) {
  return {
    *[Symbol.iterator] () {
      let ones = 0;
      let index = 0;
      let curr = 1;
      for (const i of iter) {
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
  }
}

export function backwardMapIndexes(iter, n) {
  return {
    *[Symbol.iterator] () {
      let index = 0;
      let curr = 1;
      for (const i of iter) {
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
  }
}

export function forwardMapSingleIndex(iter, index) {
  let zeros = 0;
  let ones = 0;
  let curr = 1;
  for (const i of iter) {
    if (curr) ones = i - zeros;
    else zeros = i - ones;
    if (index < i) break;
    curr = 1 - curr;
  }
  return curr ? index - zeros : -1;
}

export function backwardMapSingleIndex(iter, index) {
  let zeros = 0;
  let ones = 0;
  let curr = 1;
  for (const i of iter) {
    if (curr) {
      ones = i - zeros;
      if (index < ones) break;
    } else {
      zeros = i - ones;
    }
    curr = 1 - curr;
  }
  return curr ? index + zeros: -1;
}

function readBit(arr) {
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

function writeBit(arr) {
  let n = 0;
  let index = 0;
  let position = 0;
  return (v) => {
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

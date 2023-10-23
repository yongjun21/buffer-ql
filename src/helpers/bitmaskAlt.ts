import {
  indexToBit,
  forwardMapSingleIndex,
  backwardMapSingleIndex
} from './bitmask.js';

export function oneOfToIndexAlt(
  iter: Iterable<number>,
  noOfClass: number
): Iterable<number>[] {
  const iters: Iterable<number>[] = [];
  for (let k = 0; k < noOfClass - 1; k++) {
    iters.push({
      *[Symbol.iterator]() {
        let index = 0;
        let curr = 0;
        for (const n of iter) {
          if (n >= k) {
            const b = n > k ? 1 : 0;
            if (b !== curr) {
              yield index;
              curr = b;
            }
            index++;
          }
        }
      }
    });
  }
  return iters;
}

export function indexToOneOfAlt(...decodedBitmasks: Iterable<number>[]) {
  const iters: Iterable<number>[] = decodedBitmasks.map(b => indexToBit(b));
  iters.push(alwaysZero());

  return {
    *[Symbol.iterator]() {
      const _iters = iters.map(iter => iter[Symbol.iterator]());
      while (true) {
        for (let k = 0; k < iters.length; k++) {
          const next = _iters[k].next();
          if (next.done) return;
          if (!next.value) {
            yield k;
            break;
          }
        }
      }
    }
  };
}

export function forwardMapOneOfAlt(...decodedBitmasks: Iterable<number>[]) {
  const iters: Iterable<number>[] = decodedBitmasks.map(b => indexToBit(b));
  iters.push(alwaysZero());

  const forwardMaps: Iterable<number>[] = [];
  for (let kn = 0; kn < iters.length; kn++) {
    forwardMaps.push({
      *[Symbol.iterator]() {
        const _iters = iters
          .slice(0, kn + 1)
          .map(iter => iter[Symbol.iterator]());
        let index = 0;
        while (true) {
          for (let k = 0; k <= kn; k++) {
            const next = _iters[k].next();
            if (next.done) return;
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
  return forwardMaps;
}

export function backwardMapOneOfAlt(...decodedBitmasks: Iterable<number>[]) {
  const iters: Iterable<number>[] = decodedBitmasks.map(b => indexToBit(b));
  iters.push(alwaysZero());

  const backwardMaps: Iterable<number>[] = [];
  for (let kn = 0; kn < iters.length; kn++) {
    backwardMaps.push({
      *[Symbol.iterator]() {
        const _iters = iters
          .slice(0, kn + 1)
          .map(iter => iter[Symbol.iterator]());
        let index = 0;
        while (true) {
          for (let k = 0; k <= kn; k++) {
            const next = _iters[k].next();
            if (next.done) return;
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
  return backwardMaps;
}

export function forwardMapSingleOneOfAlt(
  index: number,
  ...decodedBitmasks: Iterable<number>[]
) {
  if (index < 0) return [0, -1];
  const kMax = decodedBitmasks.length;
  for (let k = 0; k < kMax; k++) {
    const mapped = forwardMapSingleIndex(index, decodedBitmasks[k], 0);
    if (mapped >= 0) return [k, mapped];
    index = forwardMapSingleIndex(index, decodedBitmasks[k], 1);
  }
  return [kMax, index];
}

export function backwardMapSingleOneOfAlt(
  index: number,
  group: number,
  ...decodedBitmasks: Iterable<number>[]
) {
  if (group < decodedBitmasks.length) {
    index = backwardMapSingleIndex(index, decodedBitmasks[group], 0);
  }
  for (let k = group - 1; k >= 0; k--) {
    index = backwardMapSingleIndex(index, decodedBitmasks[k], 1);
  }
  return index;
}

function* alwaysZero() {
  while (true) yield 0;
}

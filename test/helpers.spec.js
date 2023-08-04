import {
  encodeBitmask,
  decodeBitmask,
  indexToBit,
  forwardMapIndexes,
  backwardMapIndexes,
  forwardMapSingleIndex,
  backwardMapSingleIndex,
  chainForwardIndexes,
  chainBackwardIndexes,
  forwardMapOneOf,
  backwardMapOneOf,
  forwardMapSingleOneOf,
} from '../dist/helpers/bitmask.js';

import {
  getDefaultIndexMap,
  WithIndexMap
} from '../dist/helpers/useIndexMap.js';

testBitmask();
testQuicksort();
testQuicksortIsStable();
testWithIndexMap();

function testBitmask() {
  const test = [3, 6, 7, 21, 28];
  const encoded = encodeBitmask(test, 256);
  console.log(encoded);
  const decoded = decodeBitmask(encoded, 256);
  console.log([...decoded]);
  console.log([...indexToBit(decoded, 32)]);
  console.log([...forwardMapIndexes(decoded, 32)]);
  console.log([...backwardMapIndexes(decoded, 32)]);
  console.log([...chainForwardIndexes(forwardMapIndexes(decoded, 32), forwardMapIndexes(decoded, 32))]);
  console.log([...chainBackwardIndexes(backwardMapIndexes(decoded, 32), backwardMapIndexes(decoded, 32))]);
  console.log(forwardMapOneOf(32, decoded, decoded).map(iter => [...iter]));
  console.log(backwardMapOneOf(32, decoded, decoded).map(iter => [...iter]));
  const indexes = getDefaultIndexMap(32);
  console.log(indexes.map(i => forwardMapSingleIndex(decoded, i)));
  console.log(indexes.map(i => backwardMapSingleIndex(decoded, i)));
  console.log([...indexes].map(i => forwardMapSingleOneOf(i, decoded, decoded)));
}

function testQuicksort() {
  const test = [86, 67, 55, 22, 11, 66, 64, 43, 93, 20, 79, 14]
  const original = new WithIndexMap(test);
  const sorted = original.sort((a, b) => b - a);

  console.log(original.copyTo(Uint8Array), sorted.copyTo(Uint8Array));
}

function testQuicksortIsStable() {
  const test = [
    { a: 1, b: 1, c: 1 },
    { a: 1, b: 2, c: 2 },
    { a: 1, b: 1, c: 3 },
    { a: 0, b: 1, c: 4 }
  ];

  const original = new WithIndexMap(test);
  const firstSort = original.sort((a, b) => a.b - b.b);
  const secondSort = firstSort.sort((a, b) => a.a - b.a);
  const alternativeSort = original.sort((a, b) => a.a - b.a);

  console.log([...secondSort], [...alternativeSort]);
}

function testWithIndexMap() {
  const test = { a: [1, 2, 3], b: [4, 5, 6] };
  const original = new WithIndexMap(test, 3);
  const filtered = original.filter(v => v.a > 1 && v.b < 6);
  console.log([...filtered.map(v => ({ ...v }))]);
}

import {
  encodeBitmask,
  decodeBitmask,
  indexToBit,
  forwardMapIndexes,
  backwardMapIndexes,
  forwardMapSingleIndex,
  backwardMapSingleIndex
} from '../src/helpers/bitmask.mjs';

import { WithIndexMap } from '../src/helpers/useIndexMap.mjs';

testBitmask();
testQuicksort();
testQuicksortIsStable();
testWithIndexMap();

function testBitmask() {
  const test = [6, 7, 21, 28, 30];
  const encoded = encodeBitmask(test, 256);
  console.log(encoded);
  const decoded = decodeBitmask(encoded, 256);
  console.log([...decoded]);
  console.log([...indexToBit(decoded, 32)]);
  console.log([...forwardMapIndexes(decoded, 32)]);
  console.log([...backwardMapIndexes(decoded, 32)]);
  const indexes = new Int8Array(32);
  console.log(indexes.map((_, i) => forwardMapSingleIndex(decoded, i)));
  console.log(indexes.map((_, i) => backwardMapSingleIndex(decoded, i)));
}

function testQuicksort() {
  const test = [86, 67, 55, 22, 11, 66, 64, 43, 93, 20, 79, 14]
  const original = new WithIndexMap(test);
  const sorted = original.sort((a, b) => b - a);

  console.log(original.values(), sorted.values());
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

  console.log(secondSort.values(), alternativeSort.values());
}

function testWithIndexMap() {
  const test = { a: [1, 2, 3], b: [4, 5, 6] };
  const original = new WithIndexMap(test);
  const filtered = original.filter(v => v.a > 1);
  console.log(filtered.values());
}

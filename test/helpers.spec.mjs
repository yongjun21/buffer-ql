import {
  encodeBitmask,
  decodeBitmask,
  indexToBit,
  forwardMapIndexes,
  backwardMapIndexes,
  forwardMapSingleIndex,
  backwardMapSingleIndex,
} from "../src/helpers/bitmask.mjs";

import { quicksort } from "../src/helpers/quicksort.mjs";

testBitmask();
testQuicksort();
testQuicksortIsStable();

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
  const test = [86, 67, 55, 22, 11, 66, 64, 43, 93, 20, 79, 14];
  const mapping = quicksort(test, (a, b) => b - a);

  console.log(test, test.map((_, i) => test[mapping[i]]));
}

function testQuicksortIsStable() {
  const test = [
    { a: 1, b: 1, c: 1 },
    { a: 1, b: 2, c: 2 },
    { a: 1, b: 1, c: 3 },
    { a: 0, b: 1, c: 4 }
  ];
  const mappingA = quicksort(test, (a, b) => a.b - b.b);
  const mappingB = quicksort(test, (a, b) => a.a - b.a, mappingA);
  const mappingC = quicksort(test, (a, b) => a.a - b.a);

  console.log(test.map((_, i) => test[mappingB[i]]));
  console.log(test.map((_, i) => test[mappingC[i]]));
}
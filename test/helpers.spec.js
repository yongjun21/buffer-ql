import {
  encodeBitmask,
  decodeBitmask,
  indexToBit,
  indexToOneOf,
  forwardMapIndexes,
  backwardMapIndexes,
  forwardMapSingleIndex,
  backwardMapSingleIndex,
  chainForwardIndexes,
  chainBackwardIndexes,
  forwardMapOneOf,
  backwardMapOneOf,
  forwardMapSingleOneOf,
  backwardMapSingleOneOf
} from '../dist/helpers/bitmask.js';

import { WithIndexMap } from '../dist/helpers/useIndexMap.js';

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

  const forwardIndexes = [...forwardMapIndexes(decoded, 32)];
  const backwardIndexes = [...backwardMapIndexes(decoded, 32)];

  console.log(forwardIndexes);
  console.log(backwardIndexes);
  console.log([...chainForwardIndexes(forwardIndexes, forwardIndexes)]);
  console.log([...chainBackwardIndexes(backwardIndexes, backwardIndexes)]);

  console.log(forwardIndexes.map((_, i) => forwardMapSingleIndex(decoded, i)));
  console.log(
    backwardIndexes.map((_, i) => backwardMapSingleIndex(decoded, i))
  );

  const discriminator = [...indexToOneOf(32, decoded, decoded)];
  const forwardOneOf = forwardMapOneOf(32, decoded, decoded);
  const backwardOneOf = backwardMapOneOf(32, decoded, decoded);
  console.log(discriminator);
  console.log(forwardOneOf.map(iter => [...iter]));
  console.log(backwardOneOf.map(iter => [...iter]));

  console.log(
    [...discriminator]
      .map((_, i) => forwardMapSingleOneOf(i, decoded, decoded))
      .map(([k, i]) => backwardMapSingleOneOf(k, i, decoded, decoded))
  );
}

function testQuicksort() {
  const test = [86, 67, 55, 22, 11, 66, 64, 43, 93, 20, 79, 14];
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

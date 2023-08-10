import { LazyArray, tuple } from '../dist/core/LazyArray.js';

testQuicksort();
testQuicksortIsStable();
testLazyArray();

function testQuicksort() {
  const test = [86, 67, 55, 22, 11, 66, 64, 43, 93, 20, 79, 14];
  const original = new LazyArray(test);
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

  const original = new LazyArray(test);
  const firstSort = original.sort((a, b) => a.b - b.b);
  const secondSort = firstSort.sort((a, b) => a.a - b.a);
  const alternativeSort = original.sort((a, b) => a.a - b.a);

  console.log([...secondSort], [...alternativeSort]);
}

function testLazyArray() {
  const tupleData = new LazyArray(tuple([1, 2, 3], [4, 5, 6]), 3);
  const namedTupleData = new LazyArray(
    { a: [1, 2, 3], b: [4, 5, 6], c: { d: [1, 2, 3], e: [4, 5, 6] } },
    3
  );
  console.log([...tupleData.filter(v => v[0] > 1 && v[1] < 6)]);
  console.log([...namedTupleData.filter(v => v.c.d > 1 && v.c.e < 6)]);
}

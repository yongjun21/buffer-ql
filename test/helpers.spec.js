import {
  encodeBitmask,
  decodeBitmask,
  encodeOneOf,
  indexToBit,
  indexToOneOf,
  oneOfToIndex,
  mergeOneOfIndexes,
  forwardMapIndexes,
  backwardMapIndexes,
  forwardMapSingleIndex,
  backwardMapSingleIndex,
  chainForwardIndexes,
  chainBackwardIndexes,
  forwardMapOneOf,
  backwardMapOneOf,
  forwardMapSingleOneOf,
  backwardMapSingleOneOf,
  diffIndexes
} from '../dist/index.js';

testBitmask();

function testBitmask() {
  const test = [3, 6, 7, 21, 28];
  const encoded = encodeBitmask(test, 256);
  const decoded = decodeBitmask(encoded, 256);
  console.log(encoded);
  console.log(Int32Array.from(decoded));
  console.log(Uint8Array.from(indexToBit(32, decoded)));

  const forwardIndexes = forwardMapIndexes(32, decoded);
  const backwardIndexes = backwardMapIndexes(32, decoded);
  const chainedForward = chainForwardIndexes(forwardIndexes, forwardIndexes);
  const chainedBackward = chainBackwardIndexes(backwardIndexes, backwardIndexes);
  console.log(Int32Array.from(forwardIndexes));
  console.log(Int32Array.from(backwardIndexes));
  console.log(Int32Array.from(chainedForward));
  console.log(Int32Array.from(chainedBackward));

  console.log(
    [...forwardIndexes].map((_, i) => forwardMapSingleIndex(i, decoded))
  );
  console.log(
    [...backwardIndexes].map((_, i) => backwardMapSingleIndex(i, decoded))
  );

  const test2 = [
    0, 0, 0, 1, 1, 1, 0, 2,
    2, 2, 1, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 0, 0, 0, 
    0, 0, 0, 0, 2, 2, 2, 2
  ];
  const oneOfIndexes = oneOfToIndex(test2);
  const encodedOneOf = encodeOneOf(oneOfIndexes, 32, 3);
  const decodedOneOf = mergeOneOfIndexes(
    32,
    ...encodedOneOf.map(encoded => decodeBitmask(encoded, 32))
  );
  console.log(Int32Array.from(oneOfIndexes));
  console.log(Int32Array.from(decodedOneOf));

  const discriminator = indexToOneOf(oneOfIndexes, 3);
  const forwardOneOf = forwardMapOneOf(oneOfIndexes, 3);
  const backwardOneOf = backwardMapOneOf(oneOfIndexes, 3);
  console.log(Uint8Array.from(discriminator));
  console.log(forwardOneOf.map(iter => Int32Array.from(iter)));
  console.log(backwardOneOf.map(iter => Int32Array.from(iter)));

  console.log(
    test2
      .map((_, i) => forwardMapSingleOneOf(i, oneOfIndexes, 3))
      .map(([k, i]) => backwardMapSingleOneOf(i, oneOfIndexes, k))
  );

  const test3 = [1, 2, 3, 4, 5, 6, 7, 8];
  const diff = diffIndexes(test, test3);
  const diffApplied = diffIndexes(test, diff);
  const diffUnapplied = diffIndexes(test3, diff);
  console.log([...diff]);
  console.log([...diffApplied]);
  console.log([...diffUnapplied]);
}

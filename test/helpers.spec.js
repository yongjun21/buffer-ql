import {
  encodeBitmask,
  decodeBitmask,
  encodeOneOf,
  decodeOneOf,
  bitToIndex,
  oneOfToIndex,
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
  backwardMapSingleOneOf,
  diffIndexes,
  diffOneOfs,
} from '../dist/index.js';

testBitmask();

function testBitmask() {
  const test = [
    0, 0, 0, 1, 1, 1, 0, 1,
    1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 0 ,0 ,0,
    0, 0, 0, 0, 1, 1, 1, 1
  ];
  const encoded = encodeBitmask(bitToIndex(test), 255);
  const decoded = decodeBitmask(encoded, 255);
  console.log(encoded);
  console.log(Int32Array.from(decoded));
  console.log(Uint8Array.from(indexToBit(decoded)));

  const forwardIndexes = forwardMapIndexes(decoded);
  const backwardIndexes = backwardMapIndexes(decoded);
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
  const encodedOneOf = encodeOneOf(oneOfToIndex(test2, 3), 255, 3);
  const decodedOneOf = decodeOneOf(encodedOneOf, 255, 3);
  console.log(encodedOneOf);
  console.log(Int32Array.from(decodedOneOf));

  const discriminator = indexToOneOf(decodedOneOf, 3);
  const forwardOneOf = forwardMapOneOf(decodedOneOf, 3);
  const backwardOneOf = backwardMapOneOf(decodedOneOf, 3);
  console.log(Uint8Array.from(discriminator));
  console.log(forwardOneOf.map(iter => Int32Array.from(iter)));
  console.log(backwardOneOf.map(iter => Int32Array.from(iter)));

  console.log(
    test2
      .map((_, i) => forwardMapSingleOneOf(i, decodedOneOf, 3))
      .map(([k, i]) => backwardMapSingleOneOf(i, k, decodedOneOf, 3))
  );

  const test3 = [1, 2, 3, 4, 5, 6, 7, 8];
  const diff = diffIndexes(decoded, test3);
  const diffApplied = diffIndexes(decoded, diff);
  const diffUnapplied = diffIndexes(test3, diff);
  console.log([...diff]);
  console.log([...diffApplied]);
  console.log([...diffUnapplied]);

  const test4 = [
    1, 1, 2, 2, 2, 1, 0, 2,
    2, 2, 1, 2, 2, 2, 2, 2,
    2, 2, 2, 1, 1, 1, 1, 0, 
    0, 0, 0, 0, 2, 2, 2, 2
  ];
  const oneOfDiff = diffOneOfs(decodedOneOf, oneOfToIndex(test4, 3), 3);
  console.log(Int32Array.from(oneOfDiff));
}

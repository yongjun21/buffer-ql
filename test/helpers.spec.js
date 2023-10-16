import {
  encodeBitmask,
  decodeBitmask,
  indexToBit,
  indexToOneOf,
  oneOfToIndex,
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
} from '../dist/index.js';

testBitmask();

function testBitmask() {
  const test = [3, 6, 7, 21, 28];
  const encoded = encodeBitmask(test, 256);
  console.log(encoded);
  const decoded = decodeBitmask(encoded, 256);
  console.log(decoded.asInt32Array());
  console.log(indexToBit(32, decoded).asUint8Array());

  const forwardIndexes = forwardMapIndexes(32, decoded).asInt32Array();
  const backwardIndexes = backwardMapIndexes(32, decoded).asInt32Array();

  console.log(forwardIndexes);
  console.log(backwardIndexes);
  console.log(chainForwardIndexes(32, forwardIndexes, forwardIndexes).asInt32Array());
  console.log(chainBackwardIndexes(32, backwardIndexes, backwardIndexes).asInt32Array());

  console.log(forwardIndexes.map((_, i) => forwardMapSingleIndex(decoded, i)));
  console.log(
    backwardIndexes.map((_, i) => backwardMapSingleIndex(decoded, i))
  );

  const test2 = [
    0, 0, 0, 1, 1, 1, 0, 2, 2,
    2, 1, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 0, 0, 0, 0, 0, 0,
    0, 2, 2, 2, 2
  ];
  const oneOfBitmasks = oneOfToIndex(test2, 3);
  console.log(oneOfBitmasks.map(iter => [...iter]));
  const discriminator = indexToOneOf(32, ...oneOfBitmasks);
  const forwardOneOf = forwardMapOneOf(32, ...oneOfBitmasks);
  const backwardOneOf = backwardMapOneOf(32, ...oneOfBitmasks);
  console.log(discriminator.asUint8Array());
  console.log(forwardOneOf.map(iter => iter.asInt32Array()));
  console.log(backwardOneOf.map(iter => iter.asInt32Array()));

  console.log(
    test2
      .map((_, i) => forwardMapSingleOneOf(i, ...oneOfBitmasks))
      .map(([k, i]) => backwardMapSingleOneOf(k, i, ...oneOfBitmasks))
  );
  
  const test3 = [1, 2, 3, 4, 5, 6, 7, 8];
  const diff = diffIndexes(test, test3);
  const diffApplied = diffIndexes(test, diff);
  const diffUnapplied = diffIndexes(test3, diff);
  console.log([...diff]);
  console.log([...diffApplied]);
  console.log([...diffUnapplied]);
}

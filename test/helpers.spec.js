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

  const discriminator = indexToOneOf(32, decoded, decoded).asUint8Array();
  const forwardOneOf = forwardMapOneOf(32, decoded, decoded);
  const backwardOneOf = backwardMapOneOf(32, decoded, decoded);
  console.log(discriminator);
  console.log(forwardOneOf.map(iter => iter.asInt32Array()));
  console.log(backwardOneOf.map(iter => iter.asInt32Array()));

  console.log(
    [...discriminator]
      .map((_, i) => forwardMapSingleOneOf(i, decoded, decoded))
      .map(([k, i]) => backwardMapSingleOneOf(k, i, decoded, decoded))
  );
}

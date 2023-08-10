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

import {
  encodeBitmask,
  decodeBitmask,
  indexToBit,
  forwardMapIndexes,
  backwardMapIndexes,
  forwardMapSingleIndex,
  backwardMapSingleIndex,
} from "./helpers/bitmask.mjs";

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

export { createReader, linkReaders, ALL_KEYS, ALL_VALUES } from './core/reader.js';
export type { Reader } from './core/Readers.js';

export { encodeWithSchema } from './core/writer.js';

export { LazyArray, getDefaultIndexMap, tuple } from './core/LazyArray.js';
export type { NestedLazyArray } from './core/LazyArray.js';

export { extendSchema } from './schema/index.js';

export {
  encodeBitmask,
  decodeBitmask,
  indexToBit,
  bitToIndex,
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
  backwardMapSingleOneOf
} from './helpers/bitmask.js';

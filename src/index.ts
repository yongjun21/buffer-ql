export { createReader, linkReaders, ALL_KEYS, ALL_VALUES } from './core/reader';
export type { Reader } from './core/reader';

export { encodeWithSchema } from './core/writer';

export { LazyArray, getDefaultIndexMap, tuple } from './core/LazyArray';
export type { NestedLazyArray } from './core/LazyArray';

export { extendSchema } from './schema/index';

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
} from './helpers/bitmask';

export { createReader, linkReaders, ALL_KEYS, ALL_VALUES } from './core/reader';
export type { Reader } from './core/reader';

export {
  getDefaultIndexMap,
  tuple,
  LazyArray,
  NestedLazyArray
} from './core/LazyArray';

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

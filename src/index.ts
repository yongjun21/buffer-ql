export { extendSchema } from './schema/index';

export { getDefaultIndexMap, tuple, WithIndexMap } from './helpers/useIndexMap'

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
  backwardMapSingleOneOf,
} from './helpers/bitmask';

export { extendSchema } from './schema/index';

export { getDefaultIndexMap, WithIndexMap } from './helpers/useIndexMap'

export {
  encodeBitmask,
  decodeBitmask,
  indexToBit,
  forwardMapIndexes,
  backwardMapIndexes,
  forwardMapSingleIndex,
  backwardMapSingleIndex,
  chainForwardIndexes,
  chainBackwardIndexes,
  forwardMapOneOf,
  backwardMapOneOf,
} from './helpers/bitmask';

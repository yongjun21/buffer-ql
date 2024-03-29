/*
Buffer Query Language - A set of tools to encode any data structure to buffer and consume without deserialization
Copyright (C) 2023  Thong Yong Jun

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Reader } from './core/Readers.js';

type OneReader = Reader<true>;
type ManyReader = Reader<false>;

export type { OneReader, ManyReader };

export { createReader, linkReaders, ALL_KEYS, ALL_VALUES } from './core/reader.js';

export { createEncoder } from './core/writer.js';

export { LazyArray, getDefaultIndexMap, tuple } from './core/LazyArray.js';
export type { NestedLazyArray } from './core/LazyArray.js';

export { extendSchema } from './schema/index.js';

export { DataTape } from './helpers/io.js';

export {
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
} from './helpers/bitmask.js';

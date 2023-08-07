import { WithIndexMap, getDefaultIndexMap } from '../helpers/useIndexMap.js';
import {
  decodeBitmask,
  forwardMapIndexes,
  forwardMapSingleIndex,
  chainForwardIndexes,
  indexToOneOf,
  forwardMapOneOf,
  forwardMapSingleOneOf
} from '../helpers/bitmask.js';
import { readString } from '../helpers/common.js';

import { KeyAccessError, TraversalError, TypeError } from './error.js';

import type {
  Schema,
  SchemaPrimitiveType,
  SchemaCompoundType,
  SchemaNamedTupleType
} from '../schema/index.js';

type NestedWithIndexMap<T> = WithIndexMap<T | WithIndexMap<T>>;

type Single = true;
type Multiple = false;
type IndexType<T extends boolean> = T extends Single
  ? number
  : Iterable<number>;
type ValueReturnType<U, T extends boolean> = T extends Single
  ? U
  : NestedWithIndexMap<U>;

export const ALL_KEYS = Symbol('ALL_KEYS');
export const ALL_VALUES = Symbol('ALL_VALUES');
export const NULL_VALUE = Symbol('NULL_VALUE');

type Key = string | number | symbol;

export function createReader(data: ArrayBuffer | DataView, schema: Schema) {
  const dataView = data instanceof DataView ? data : new DataView(data);

  class Reader<T extends boolean> {
    typeName: string;
    currentOffset: number;
    currentType: Schema[string];
    currentIndex: IndexType<T>;
    currentLength: number;

    constructor(
      offset: number,
      type: string,
      index: IndexType<boolean> = 0,
      length: number = 1
    ) {
      this.typeName = type;
      this.currentOffset = offset;
      if (!(type in schema)) {
        throw new TypeError(`Missing type definition ${type} in schema`);
      }
      this.currentType = schema[type];
      this.currentIndex = index as IndexType<T>;
      this.currentLength = length;
    }

    isPrimitive() {
      return this.currentType.type === 'Primitive';
    }

    isArray() {
      return this.currentType.type === 'Array';
    }

    isMap() {
      return this.currentType.type === 'Map';
    }

    isOptional() {
      return this.currentType.type === 'Optional';
    }

    isOneOf() {
      return this.currentType.type === 'OneOf';
    }

    isTuple() {
      return this.currentType.type === 'Tuple';
    }

    isNamedTuple() {
      return this.currentType.type === 'NamedTuple';
    }

    isLink() {
      return this.currentType.type === 'Link';
    }

    singleValue(): this is Reader<Single> {
      return typeof this.currentIndex === 'number';
    }

    isUndefined() {
      return (
        this.currentOffset < 0 ||
        (typeof this.currentIndex === 'number' &&
          (this.currentIndex < 0 || this.currentIndex >= this.currentLength))
      );
    }

    isBranched(): this is BranchedReader {
      return false;
    }

    value<U = any>(defaultValue?: any): ValueReturnType<U, T> {
      const { currentOffset, currentType, currentLength } = this;
      if (this.isPrimitive()) {
        const { size, read } = currentType as SchemaPrimitiveType;

        const getter = (i: number) =>
          i < 0 || i >= currentLength
            ? defaultValue
            : read(dataView, currentOffset + i * size);

        return (
          this.singleValue()
            ? getter(this.currentIndex)
            : new WithIndexMap(getter, this._freezeCurrentIndex())
        ) as ValueReturnType<U, T>;
      } else if (this.isTuple()) {
        const { children } = currentType as SchemaCompoundType<'Tuple'>;
        const nested = children.map((_, k) => this.get(k).value(defaultValue));
        return (
          this.singleValue()
            ? nested
            : new WithIndexMap(
                (i: number) => nested.map(k => k.get(i)),
                this._freezeCurrentIndex()
              )
        ) as ValueReturnType<U, T>;
      } else if (this.isNamedTuple()) {
        const { keyIndex } = currentType as SchemaNamedTupleType;
        const nested = Object.keys(keyIndex).map(
          key => [key, this.get(key).value(defaultValue)] as [string, any]
        );
        return (
          this.singleValue()
            ? Object.fromEntries(nested)
            : new WithIndexMap(
                (i: number) =>
                  Object.fromEntries(nested.map(([k, v]) => [k, v.get(i)])),
                this._freezeCurrentIndex()
              )
        ) as ValueReturnType<U, T>;
      } else if (this.isArray()) {
        const nested = this.get(ALL_VALUES).value(defaultValue);
        return (
          this.singleValue()
            ? nested
            : new WithIndexMap(
                (i: number) => nested.get(i),
                this._freezeCurrentIndex()
              )
        ) as ValueReturnType<U, T>;
      } else if (this.isMap()) {
        const nestedKeys = this.get(ALL_KEYS).value<string>();
        const nestedValues = this.get(ALL_VALUES).value(defaultValue);
        if (this.singleValue()) {
          const value: any = {};
          let k = 0;
          for (const key of nestedKeys) {
            value[key as string] = nestedValues.get(k++);
          }
          return value;
        } else {
          return new WithIndexMap((i: number) => {
            const value: any = {};
            let k = 0;
            for (const key of nestedKeys.get(i)) {
              value[key] = nestedValues.get(i).get(k++);
            }
            return value;
          }, this._freezeCurrentIndex()) as ValueReturnType<U, T>;
        }
      } else if (this.isOptional()) {
        return this.get(NULL_VALUE).value(defaultValue);
      } else if (this.isOneOf()) {
        return this.get(NULL_VALUE).value(defaultValue);
      } else {
        throw new TraversalError(`Cannot get value of type ${this.typeName}`);
      }
    }

    get<K extends Key>(
      key: K
    ): K extends typeof ALL_KEYS | typeof ALL_VALUES
      ? ReaderMutiple
      : Reader<T> {
      const { currentOffset, currentType, currentIndex, currentLength } = this;
      let nextReader: Reader<boolean>;
      if (this.isTuple()) {
        if (typeof key !== 'number') {
          throw new KeyAccessError('Tuple type can only be accessed by index');
        }
        const i = key;
        const { size, children } = currentType as SchemaCompoundType<'Tuple'>;
        if (i < 0 || i >= children.length) {
          throw new KeyAccessError(`Index ${i} is out of bounds`);
        }
        const nextOffset = currentOffset + i * size;
        const nextType = children[i];
        nextReader = new Reader(
          nextOffset,
          nextType,
          currentIndex,
          currentLength
        );
      } else if (this.isNamedTuple()) {
        if (typeof key !== 'string') {
          throw new KeyAccessError(
            'Named tuple type can only be accessed by key'
          );
        }
        const { size, children, keyIndex } =
          currentType as SchemaNamedTupleType;
        if (!(key in keyIndex)) {
          throw new KeyAccessError(`Undefined key ${key}`);
        }
        const i = keyIndex[key];
        const nextOffset = currentOffset + i * size;
        const nextType = children[i];
        nextReader = new Reader(
          nextOffset,
          nextType,
          currentIndex,
          currentLength
        );
      } else if (this.isArray()) {
        if (typeof currentIndex === 'number') {
          nextReader = this._createArrayReader(currentIndex, key);
        } else {
          nextReader = new NestedReader(
            new WithIndexMap(
              i => this._createArrayReader(i, key),
              this._freezeCurrentIndex()
            )
          );
        }
      } else if (this.isMap()) {
        if (typeof currentIndex === 'number') {
          nextReader = this._createMapReader(currentIndex, key);
        } else {
          nextReader = new NestedReader(
            new WithIndexMap(
              i => this._createMapReader(i, key),
              this._freezeCurrentIndex()
            )
          );
        }
      } else if (this.isOptional()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Optional'>;
        const bitmaskOffset = dataView.getInt32(currentOffset, true);
        const bitmaskLength = dataView.getUint32(currentOffset + 4, true);
        const nextOffset = dataView.getInt32(currentOffset + 8, true);
        const bitmask = decodeBitmask(
          new Uint8Array(dataView.buffer, bitmaskOffset, bitmaskLength),
          currentLength
        );
        const nextIndex = this.singleValue()
          ? forwardMapSingleIndex(bitmask, this.currentIndex)
          : chainForwardIndexes(
              this.currentIndex as Iterable<number>,
              forwardMapIndexes(bitmask, currentLength)
            );
        nextReader = new Reader<boolean>(
          nextOffset,
          nextType,
          nextIndex,
          currentLength
        );
      } else if (this.isOneOf()) {
        return BranchedReader.from(this) as Reader<boolean>;
      } else {
        throw new TraversalError('Primitive types cannot be traversed further');
      }
      if (nextReader.isOptional()) return nextReader.get(NULL_VALUE);
      if (nextReader.isOneOf()) return nextReader.get(NULL_VALUE);
      return nextReader;
    }

    _createArrayReader(atIndex: number, i: Key): Reader<boolean> {
      const {
        size,
        children: [nextType]
      } = this.currentType as SchemaCompoundType<'Array'>;
      const offset = this.currentOffset + atIndex * size;
      const nextOffset = dataView.getInt32(offset, true);
      const nextLength = dataView.getInt32(offset + 4, true);
      if (typeof i !== 'number') {
        if (i !== ALL_VALUES) {
          throw new KeyAccessError(`Index must be a number or ALL_VALUES`);
        }
      }
      const nextIndex =
        i === ALL_VALUES ? getDefaultIndexMap(nextLength) : (i as number);
      return new Reader(nextOffset, nextType, nextIndex, nextLength);
    }

    _createMapReader(atIndex: number, k: Key): Reader<boolean> {
      const {
        size,
        children: [nextType]
      } = this.currentType as SchemaCompoundType<'Array'>;
      const offset = this.currentOffset + atIndex * size;
      const offsetToKeys = dataView.getInt32(offset, true);
      const offsetToValues = dataView.getInt32(offset + 4, true);
      const nextLength = dataView.getInt32(offset + 8, true);
      if (typeof k !== 'string') {
        if (k !== ALL_VALUES && k !== ALL_KEYS) {
          throw new KeyAccessError(
            `Key must be a string or ALL_VALUES or ALL_KEYS`
          );
        }
        const nextIndex = getDefaultIndexMap(nextLength);
        return new Reader(
          k === ALL_KEYS ? offsetToKeys : offsetToValues,
          k === ALL_KEYS ? 'String' : nextType,
          nextIndex,
          nextLength
        );
      } else {
        for (let i = 0; i < nextLength; i++) {
          if (k === readString(dataView, offsetToKeys + i * 8)) {
            return new Reader(offsetToValues, nextType, i, nextLength);
          }
        }
        return new Reader(offsetToValues, nextType, -1, nextLength);
      }
    }

    _freezeCurrentIndex() {
      if (this.singleValue()) {
        throw new TraversalError(
          'Calling _freezeCurrentIndex on a single value'
        );
      }
      const { currentLength, currentIndex } = this;
      const frozen = new Int32Array(currentLength);
      let i = 0;
      for (const index of currentIndex as Iterable<number>) {
        if (i >= currentLength) break;
        frozen[i++] = index;
      }
      this.currentIndex = frozen as Iterable<number> as IndexType<T>;
      return frozen;
    }
  }

  class ReaderMutiple extends Reader<false> {}

  class NestedReader extends Reader<Multiple> {
    readers: NestedWithIndexMap<Reader<boolean>>;
    ref: Reader<boolean>;

    constructor(readers: NestedWithIndexMap<Reader<boolean>>) {
      const ref = NestedReader._reduce<Reader<boolean>>(
        readers,
        (acc, reader) => acc || reader
      );
      if (!ref) {
        throw new TraversalError('Cannot create empty NestedReader');
      }
      super(
        ref.currentOffset,
        ref.typeName,
        getDefaultIndexMap(readers.length),
        readers.length
      );
      this.readers = readers;
      this.ref = ref;
    }

    isBranched() {
      return this.ref.isBranched();
    }

    singleValue() {
      return false;
    }

    switchBranch(branchIndex: number) {
      NestedReader._forEach(this.readers, reader => {
        if (reader.isBranched()) reader.switchBranch(branchIndex);
      });
      this.typeName = this.ref.typeName;
      this.currentOffset = this.ref.currentOffset;
      return this;
    }

    value<U = any>(defaultValue?: any) {
      return NestedReader._map(this.readers, reader =>
        reader.value(defaultValue)
      ) as ValueReturnType<U, Multiple>;
    }

    get<K extends Key>(key: K): Reader<boolean> {
      const readers = NestedReader._map<Reader<boolean>>(
        this.readers,
        reader => {
          const nextReader = reader.get(key);
          return (
            nextReader instanceof NestedReader ? nextReader.readers : nextReader
          ) as Reader<boolean>;
        }
      );
      return new NestedReader(readers);
    }

    static _forEach(
      arr: NestedWithIndexMap<Reader<boolean>>,
      fn: (v: Reader<boolean>, i: number) => void
    ) {
      arr.forEach((reader, i) => {
        reader instanceof WithIndexMap
          ? this._forEach(reader, fn)
          : fn(reader, i);
      });
    }

    static _map<U = any>(
      arr: NestedWithIndexMap<Reader<boolean>>,
      fn: (v: Reader<boolean>, i: number) => U
    ): NestedWithIndexMap<U> {
      return arr.map((reader, i) => {
        return reader instanceof WithIndexMap
          ? this._map(reader, fn)
          : fn(reader, i);
      });
    }

    static _reduce<U = any>(
      arr: NestedWithIndexMap<Reader<boolean>>,
      fn: (acc: U | undefined, v: Reader<boolean> | U, i: number) => U,
      init?: U
    ): U | undefined {
      return arr.reduce((acc, reader, i) => {
        return reader instanceof WithIndexMap
          ? this._reduce(arr, fn, init)!
          : fn(acc, reader, i);
      }, init);
    }
  }

  class BranchedReader extends Reader<boolean> {
    branches: Reader<boolean>[];
    currentBranch: number;
    discriminator: IndexType<boolean>;

    constructor(
      branches: Reader<boolean>[],
      currentBranch: number,
      discriminator: IndexType<boolean>
    ) {
      const branch = branches[currentBranch];
      super(
        branch.currentOffset,
        branch.typeName,
        branch.currentIndex,
        branch.currentLength
      );
      this.branches = branches;
      this.currentBranch = currentBranch;
      this.discriminator = discriminator;
    }

    isBranched() {
      return true;
    }

    switchBranch(branchIndex: number) {
      const branch = this.branches[branchIndex];
      this.typeName = branch.typeName;
      this.currentOffset = branch.currentOffset;
      this.currentType = branch.currentType;
      this.currentIndex = branch.currentIndex;
      this.currentBranch = branchIndex;
      return this;
    }

    get(key: string | number | symbol): Reader<boolean> {
      const next = super.get(key);
      const nextBranches = [...this.branches];
      nextBranches[this.currentBranch] = next;
      return new BranchedReader(
        nextBranches,
        this.currentBranch,
        this.discriminator
      );
    }

    value<U = any>(defaultValue?: any) {
      const { discriminator, currentLength } = this;
      if (this.singleValue()) {
        return this.branches[discriminator as number].value(
          defaultValue
        ) as U;
      } else {
        const branchValues = this.branches.map(branch =>
          branch.value(defaultValue)
        );
        const discriminatorValue = new Uint8Array(
          discriminator as Iterable<number>
        ).slice(0, currentLength);
        const getter = (i: number) =>
          i < 0 || i >= currentLength
            ? defaultValue
            : branchValues[discriminatorValue[i]].get(i);
        return new WithIndexMap<U>(getter, currentLength);
      }
    }

    static from<T extends boolean>(root: Reader<T>) {
      if (!root.isOneOf()) {
        throw new TraversalError(`Expects OneOf type`);
      }

      const { currentOffset, currentType, currentLength } = root;

      const { size, children } = currentType as SchemaCompoundType<'OneOf'>;

      const bitmasks: Uint8Array[] = [];
      for (let i = 0; i < children.length - 1; i++) {
        const bitmaskOffset = dataView.getInt32(
          currentOffset + i * size + 4,
          true
        );
        const bitmaskLength = dataView.getUint32(
          currentOffset + i * size + 8,
          true
        );
        bitmasks.push(
          new Uint8Array(dataView.buffer, bitmaskOffset, bitmaskLength)
        );
      }

      if (root.singleValue()) {
        const [discriminator, nextIndex] = forwardMapSingleOneOf(
          root.currentIndex,
          ...bitmasks
        );
        const branches = children.map((nextType, i) => {
          const nextindex = discriminator === i ? nextIndex : -1;
          const nextOffset = currentOffset + i * size;
          const nextReader = new Reader(
            nextOffset,
            nextType,
            nextindex,
            currentLength
          );
          if (nextReader.isOptional()) return nextReader.get(NULL_VALUE);
          if (nextReader.isOneOf()) return nextReader.get(NULL_VALUE);
          return nextReader;
        });

        return new BranchedReader(branches, discriminator, discriminator);
      } else {
        const discriminator = indexToOneOf(length, ...bitmasks);
        const forwardMaps = forwardMapOneOf(length, ...bitmasks);

        const branches = children.map((nextType, i) => {
          const nextIndex = chainForwardIndexes(
            root.currentIndex as Iterable<number>,
            forwardMaps[i]
          );
          const nextOffset = currentOffset + i * 12;
          const nextReader = new Reader(
            nextOffset,
            nextType,
            nextIndex,
            currentLength
          );
          if (nextReader.isOptional()) return nextReader.get(NULL_VALUE);
          if (nextReader.isOneOf()) return nextReader.get(NULL_VALUE);
          return nextReader;
        });

        return new BranchedReader(branches, 0, discriminator);
      }
    }
  }

  return Reader;
}

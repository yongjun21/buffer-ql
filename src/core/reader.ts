import {
  WithIndexMap,
  getDefaultIndexMap,
  getIndexMapFromIterable
} from '../helpers/useIndexMap.js';
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

import { KeyAccessError, TraversalError } from './error.js';

import type {
  Schema,
  SchemaPrimitiveType,
  SchemaCompoundType,
  SchemaTupleType,
  SchemaNamedTupleType
} from '../schema/index.js';

type NestedWithIndexMap<T> = WithIndexMap<T | WithIndexMap<T>>;

export const ALL_KEYS = Symbol('ALL_KEYS');
export const ALL_VALUES = Symbol('ALL_VALUES');
export const NULL_VALUE = Symbol('NULL_VALUE');

export function createReader(data: ArrayBuffer | DataView, schema: Schema) {
  const dataView = data instanceof DataView ? data : new DataView(data);

  class Reader {
    typeName: string;
    currentOffset: number;
    currentType: Schema[string];
    currentIndex: Iterable<number> | number;
    currentLength: number;

    constructor(
      offset: number,
      type: string,
      index: Iterable<number> | number = 0,
      length: number = 1
    ) {
      this.typeName = type;
      this.currentOffset = offset;
      this.currentType = schema[type];
      this.currentIndex = index;
      this.currentLength = length;
    }

    isPrimitive() {
      return !('type' in this.currentType);
    }

    isArray() {
      return 'type' in this.currentType && this.currentType.type === 'Array';
    }

    isMap() {
      return 'type' in this.currentType && this.currentType.type === 'Map';
    }

    isOptional() {
      return 'type' in this.currentType && this.currentType.type === 'Optional';
    }

    isOneOf() {
      return 'type' in this.currentType && this.currentType.type === 'OneOf';
    }

    isTuple() {
      return 'type' in this.currentType && this.currentType.type === 'Tuple';
    }

    isNamedTuple() {
      return (
        'type' in this.currentType && this.currentType.type === 'NamedTuple'
      );
    }

    isBranched() {
      return false;
    }

    switchBranch(branchIndex: number) {
      // do nothing
    }

    value<T = any>(
      defaultValue?: T
    ): WithIndexMap<T | undefined> | T | undefined {
      const { currentOffset, currentType, currentIndex, currentLength } = this;
      if (this.isPrimitive()) {
        const { size, read } = currentType as SchemaPrimitiveType;

        const getter = (i: number) =>
          i < 0 || i >= currentLength
            ? defaultValue
            : read(dataView, currentOffset + i * size);

        if (typeof currentIndex === 'number') {
          return getter(currentIndex);
        } else {
          return new WithIndexMap(
            getter,
            currentIndex instanceof Int32Array
              ? currentIndex
              : getIndexMapFromIterable(currentIndex, currentLength)
          );
        }
      }
    }

    get(key: string | number | symbol): Reader {
      const { currentOffset, currentType, currentIndex, currentLength } = this;
      let nextReader: Reader;
      if (this.isTuple()) {
        if (typeof key !== 'number') {
          throw new KeyAccessError('Tuple type can only be accessed by index');
        }
        const i = key;
        const { size, children } = currentType as SchemaTupleType;
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
              getIndexMapFromIterable(currentIndex, currentLength)
            )
          );
        }
      } else if (this.isMap()) {
        if (typeof currentIndex === 'number') {
          nextReader = this._createMapReader(currentIndex, key);
        } else {
          nextReader = new NestedReader(
            new WithIndexMap(
              i => this._createArrayReader(i, key),
              getIndexMapFromIterable(currentIndex, currentLength)
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
        const nextIndex =
          typeof currentIndex === 'number'
            ? forwardMapSingleIndex(bitmask, currentIndex)
            : chainForwardIndexes(
                currentIndex,
                forwardMapIndexes(bitmask, currentLength)
              );
        nextReader = new Reader(nextOffset, nextType, nextIndex, currentLength);
      } else if (this.isOneOf()) {
        return new BranchedReader(this);
      } else {
        throw new TraversalError('Primitive types cannot be traversed further');
      }
      if (nextReader.isOptional()) return nextReader.get(NULL_VALUE);
      if (nextReader.isOneOf()) return nextReader.get(NULL_VALUE);
      return nextReader;
    }

    _createArrayReader(atIndex: number, i?: string | number | symbol) {
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

    _createMapReader(atIndex: number, k?: string | number | symbol) {
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
          nextType,
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
  }

  class NestedReader extends Reader {
    readers: NestedWithIndexMap<Reader>;
    ref: Reader;

    constructor(readers: NestedWithIndexMap<Reader>) {
      const ref = NestedReader._reduce<Reader>(
        readers,
        (acc, reader) => acc || reader
      );
      if (!ref) {
        throw new TraversalError('Cannot create empty NestedReader');
      }
      super(
        ref.currentOffset,
        ref.typeName,
        ref.currentIndex,
        ref.currentLength
      );
      this.readers = readers;
      this.ref = ref;
    }

    isBranched() {
      return this.ref.isBranched();
    }

    switchBranch(branchIndex: number) {
      NestedReader._forEach(this.readers, reader =>
        reader.switchBranch(branchIndex)
      );
    }

    value(defaultValue?: any) {
      return NestedReader._map(this.readers, reader =>
        reader.value(defaultValue)
      );
    }

    get(key: string | number | symbol): Reader {
      const readers = NestedReader._map(this.readers, reader => {
        const nextReader = reader.get(key);
        return nextReader instanceof NestedReader
          ? nextReader.readers
          : nextReader;
      }) as NestedWithIndexMap<Reader>;
      return new NestedReader(readers);
    }

    static _forEach(
      arr: NestedWithIndexMap<Reader>,
      fn: (v: Reader, i: number) => void
    ) {
      arr.forEach((reader, i) => {
        reader instanceof WithIndexMap
          ? this._forEach(reader, fn)
          : fn(reader, i);
      });
    }

    static _map<T>(
      arr: NestedWithIndexMap<Reader>,
      fn: (v: Reader, i: number) => T
    ): NestedWithIndexMap<T> {
      return arr.map((reader, i) => {
        return reader instanceof WithIndexMap
          ? this._map(reader, fn)
          : fn(reader, i);
      });
    }

    static _reduce<T>(
      arr: NestedWithIndexMap<Reader>,
      fn: (acc: T | undefined, v: Reader | T, i: number) => T,
      init?: T
    ): T | undefined {
      return arr.reduce((acc, reader, i) => {
        return reader instanceof WithIndexMap
          ? this._reduce(arr, fn, init)!
          : fn(acc, reader, i);
      }, init);
    }
  }

  class BranchedReader extends Reader {
    branches: Reader[];
    currentBranch: number;
    discriminator: Iterable<number> | number;

    constructor(root: Reader);

    constructor(
      branches: Reader[],
      currentBranch: number,
      discriminator: Iterable<number> | number
    );

    constructor(
      ...args: [Reader] | [Reader[], number, Iterable<number> | number]
    ) {
      if (args[0] instanceof Reader) {
        const root = args[0];
        if (!root.isOneOf()) {
          throw new TraversalError(`Expects OneOf type`);
        }

        const { currentOffset, currentType, currentIndex, currentLength } =
          root;

        const { children } = currentType as SchemaCompoundType<'OneOf'>;

        const length = dataView.getInt32(
          currentOffset + children.length * 12 - 8,
          true
        );
        const bitmasks: Uint8Array[] = [];
        for (let i = 0; i < children.length - 1; i++) {
          const bitmaskOffset = dataView.getInt32(
            currentOffset + i * 12 + 4,
            true
          );
          const bitmaskLength = dataView.getUint32(
            currentOffset + i * 12 + 8,
            true
          );
          bitmasks.push(
            new Uint8Array(dataView.buffer, bitmaskOffset, bitmaskLength)
          );
        }

        if (typeof currentIndex === 'number') {
          const [discriminator, nextIndex] = forwardMapSingleOneOf(
            currentIndex,
            ...bitmasks
          );
          const branches = children.map((nextType, i) => {
            const nextindex = discriminator === i ? nextIndex : -1;
            const nextOffset = currentOffset + i * 12;
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

          const branch = branches[discriminator];
          super(
            branch.currentOffset,
            branch.typeName,
            branch.currentIndex,
            branch.currentLength
          );
          this.branches = branches;
          this.currentBranch = discriminator;
          this.discriminator = discriminator;
        } else {
          const discriminator = indexToOneOf(length, ...bitmasks);
          const forwardMaps = forwardMapOneOf(length, ...bitmasks);

          const branches = children.map((nextType, i) => {
            const nextIndex = chainForwardIndexes(currentIndex, forwardMaps[i]);
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

          const branch = branches[0];
          super(
            branch.currentOffset,
            branch.typeName,
            branch.currentIndex,
            branch.currentLength
          );
          this.branches = branches;
          this.currentBranch = 0;
          this.discriminator = discriminator;
        }
      } else {
        const [branches, currentBranch, discriminator] = args;

        const branch = branches[currentBranch!];
        super(
          branch.currentOffset,
          branch.typeName,
          branch.currentIndex,
          branch.currentLength
        );
        this.branches = branches;
        this.currentBranch = currentBranch!;
        this.discriminator = discriminator!;
      }
    }

    isBranched() {
      return true;
    }

    switchBranch(branchIndex: number) {
      const branch = this.branches[branchIndex];
      this.currentOffset = branch.currentOffset;
      this.currentType = branch.currentType;
      this.currentIndex = branch.currentIndex;
      this.currentBranch = branchIndex;
    }

    get(key: string | number | symbol) {
      const next = super.get(key);
      const nextBranches = [...this.branches];
      nextBranches[this.currentBranch] = next;
      return new BranchedReader(
        nextBranches,
        this.currentBranch,
        this.discriminator
      );
    }

    value<T = any>(
      defaultValue?: T
    ): WithIndexMap<T | undefined> | T | undefined {
      const { discriminator, currentLength } = this;

      if (typeof discriminator === 'number') {
        return this.branches[discriminator].value(defaultValue);
      } else {
        const branchValues = this.branches.map(
          branch => branch.value(defaultValue) as WithIndexMap<T>
        );
        const discriminatorValue = getIndexMapFromIterable(
          discriminator,
          currentLength,
          Uint8Array
        );
        const getter = (i: number) =>
          i < 0 || i >= currentLength
            ? defaultValue
            : branchValues[discriminatorValue[i]].get(i);
        return new WithIndexMap(getter, currentLength);
      }
    }
  }

  return Reader;
}

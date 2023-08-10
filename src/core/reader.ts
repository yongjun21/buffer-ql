import { LazyArray, getDefaultIndexMap, NestedLazyArray } from './LazyArray.js';
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

type Single = true;
type Multiple = false;
type IndexType<T extends boolean> = T extends Single
  ? number
  : Iterable<number>;
type ValueReturnType<U, T extends boolean> = T extends Single
  ? U
  : NestedLazyArray<U>;

const MAX_INT32 = 2 ** 31 - 1;

export const ALL_KEYS = Symbol('ALL_KEYS');
export const ALL_VALUES = Symbol('ALL_VALUES');
export const NULL_VALUE = Symbol('NULL_VALUE');

type Key = string | number | symbol;

export function createReader(data: ArrayBuffer | DataView, schema: Schema) {
  const dataView = data instanceof DataView ? data : new DataView(data);

  let getCalledInternally = false;

  type ValueCallStack<Reader> = [
    Reader,
    Record<string | number, any>,
    string | number
  ][];

  class Reader<T extends boolean = Single> {
    typeName: string;
    currentOffset: number;
    currentType: Schema[string];
    currentIndex: IndexType<T>;
    currentLength: number;

    constructor(
      type: string,
      offset: number,
      index: IndexType<boolean> = 0,
      length: number = 1
    ) {
      if (!(type in schema)) {
        throw new TypeError(`Missing type definition ${type} in schema`);
      }
      this.typeName = type;
      this.currentType = schema[type];
      this.currentOffset = offset;
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

    isRef() {
      return this.currentType.type === 'Ref';
    }

    isLink() {
      return this.currentType.type === 'Link';
    }

    singleValue(): this is Reader<Single> {
      return typeof this.currentIndex === 'number';
    }

    isUndefined(atIndex: number | Iterable<number> = this.currentIndex) {
      return (
        this.currentOffset < 0 ||
        (typeof atIndex === 'number' &&
          (atIndex < 0 || atIndex >= this.currentLength))
      );
    }

    isBranched(): this is BranchedReader {
      return false;
    }

    value<U = any>(): ValueReturnType<U, T> {
      return (
        this.singleValue()
          ? this._valueAt(this.currentIndex)
          : new LazyArray<U>(i => this._valueAt(i), this._freezeCurrentIndex())
      ) as ValueReturnType<U, T>;
    }

    _valueAt<U = any>(atIndex: number): U {
      const { typeName, currentOffset, currentLength } = this;
      const root: U[] = [];
      const currentStack: ValueCallStack<Reader<boolean>> = [];
      currentStack.push([
        new Reader(typeName, currentOffset, atIndex, currentLength),
        root,
        0
      ]);
      while (currentStack.length > 0) {
        const [currentReader, parent, key] = currentStack.pop()!;
        currentReader._value(parent, key, currentStack);
      }
      return root[0];
    }

    _value(
      parent: Record<string | number, any>,
      key: string | number,
      currentStack: ValueCallStack<Reader<boolean>>
    ): void {
      if (!this.singleValue()) return;
      const { currentType, currentOffset, currentIndex } = this;
      if (this.isUndefined()) return;
      if (this.isPrimitive()) {
        const { size, read } = currentType as SchemaPrimitiveType;
        parent[key] = read(dataView, currentOffset + currentIndex * size);
      } else if (this.isTuple()) {
        const { children } = currentType as SchemaCompoundType<'Tuple'>;
        parent[key] = [];
        for (let k = children.length - 1; k >= 0; k--) {
          currentStack.push([this.get(k), parent[key], k]);
        }
      } else if (this.isNamedTuple()) {
        const { children, keyIndex } = currentType as SchemaNamedTupleType;
        const childKeys = Object.keys(keyIndex);
        parent[key] = {};
        for (let k = children.length - 1; k >= 0; k--) {
          const childKey = childKeys[k];
          currentStack.push([this.get(key), parent[key], childKey]);
        }
      } else if (this.isArray()) {
        parent[key] = this.get(ALL_VALUES).value();
      } else if (this.isMap()) {
        const childKeys = this.get(
          ALL_KEYS
        ).value<string>() as LazyArray<string>;
        parent[key] = {};
        for (let k = childKeys.length - 1; k >= 0; k--) {
          currentStack.push([this.get(k), parent[key], childKeys.get(k)]);
        }
      } else if (this.isOptional()) {
        currentStack.push([this.get(NULL_VALUE), parent, key]);
      } else if (this.isOneOf()) {
        currentStack.push([this.get(NULL_VALUE), parent, key]);
      } else if (this.isRef()) {
        currentStack.push([this.get(NULL_VALUE), parent, key]);
      } else if (this.isLink()) {
        const { children, size } = currentType as SchemaCompoundType<'Link'>;
        const [schemaKey, nextType] = children[0].split('/');
        if (schemaKey in linkReaders) {
          currentStack.push([this.get(NULL_VALUE), parent, key]);
        } else {
          const nextOffset = dataView.getInt32(
            currentOffset + currentIndex * size,
            true
          );
          const nextIndex = dataView.getInt32(
            currentOffset + currentIndex * size,
            true
          );
          parent[key] = {
            is: 'Link',
            schema: schemaKey,
            type: nextType,
            offset: nextOffset,
            atIndex: nextIndex
          };
        }
      }
    }

    get<K extends Key>(
      key: K
    ): K extends typeof ALL_KEYS | typeof ALL_VALUES
      ? Reader<Multiple>
      : Reader<T> {
      const { currentType, currentOffset, currentIndex, currentLength } = this;
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
        const nextType = children[i];
        const nextOffset = currentOffset + i * size;
        nextReader = new Reader(
          nextType,
          nextOffset,
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
        const nextType = children[i];
        const nextOffset = currentOffset + i * size;
        nextReader = new Reader(
          nextType,
          nextOffset,
          currentIndex,
          currentLength
        );
      } else if (this.isArray()) {
        if (this.singleValue()) {
          nextReader = this._createArrayReader(this.currentIndex, key);
        } else {
          nextReader = new NestedReader(
            new LazyArray(
              i => this._createArrayReader(i, key),
              this._freezeCurrentIndex()
            )
          );
        }
      } else if (this.isMap()) {
        if (this.singleValue()) {
          nextReader = this._createMapReader(this.currentIndex, key);
        } else {
          nextReader = new NestedReader(
            new LazyArray(
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
          nextType,
          nextOffset,
          nextIndex,
          currentLength
        );
      } else if (this.isOneOf()) {
        return BranchedReader.from(this) as Reader<boolean>;
      } else if (this.isRef()) {
        if (this.singleValue()) {
          nextReader = this._createRefReader(this.currentIndex);
        } else {
          nextReader = new NestedReader(
            new LazyArray(
              i => this._createRefReader(i),
              this._freezeCurrentIndex()
            )
          );
        }
      } else if (this.isLink()) {
        if (this.singleValue()) {
          nextReader = this._createLinkReader(this.currentIndex);
        } else {
          nextReader = new NestedReader(
            new LazyArray(
              i => this._createLinkReader(i),
              this._freezeCurrentIndex()
            )
          );
        }
      } else {
        throw new TraversalError('Primitive types cannot be traversed further');
      }
      getCalledInternally = true;
      if (nextReader.isOptional()) return nextReader.get(NULL_VALUE);
      if (nextReader.isOneOf()) return nextReader.get(NULL_VALUE);
      if (nextReader.isLink()) return nextReader.get(NULL_VALUE);
      getCalledInternally = false;
      return nextReader;
    }

    _createArrayReader(atIndex: number, i: Key): Reader<boolean> {
      const { currentType, currentOffset } = this;
      const {
        size,
        children: [nextType]
      } = currentType as SchemaCompoundType<'Array'>;
      const isUndefined = this.isUndefined(atIndex);
      const offset = currentOffset + atIndex * size;
      const nextOffset = isUndefined ? -1 : dataView.getInt32(offset, true);
      const nextLength = isUndefined ? 0 : dataView.getInt32(offset + 4, true);
      if (typeof i !== 'number') {
        if (i !== ALL_VALUES) {
          throw new KeyAccessError(`Index must be a number or ALL_VALUES`);
        }
        const nextIndex = getDefaultIndexMap(nextLength);
        return new Reader(nextType, nextOffset, nextIndex, nextLength);
      } else {
        return new Reader(nextType, nextOffset, i, nextLength);
      }
    }

    _createMapReader(atIndex: number, k: Key): Reader<boolean> {
      const { currentType, currentOffset } = this;
      const {
        size,
        children: [nextType]
      } = currentType as SchemaCompoundType<'Array'>;
      const isUndefined = this.isUndefined(atIndex);
      const offset = currentOffset + atIndex * size;
      const offsetToKeys = isUndefined ? -1 : dataView.getInt32(offset, true);
      const offsetToValues = isUndefined
        ? -1
        : dataView.getInt32(offset + 4, true);
      const nextLength = isUndefined ? 0 : dataView.getInt32(offset + 8, true);
      if (typeof k !== 'string') {
        if (k !== ALL_VALUES && k !== ALL_KEYS) {
          throw new KeyAccessError(
            `Key must be a string or ALL_VALUES or ALL_KEYS`
          );
        }
        const nextIndex = getDefaultIndexMap(nextLength);
        return new Reader(
          k === ALL_KEYS ? 'String' : nextType,
          k === ALL_KEYS ? offsetToKeys : offsetToValues,
          nextIndex,
          nextLength
        );
      } else {
        for (let i = 0; i < nextLength; i++) {
          if (k === readString(dataView, offsetToKeys + i * 8)) {
            return new Reader(nextType, offsetToValues, i, nextLength);
          }
        }
        return new Reader(nextType, offsetToValues, -1, nextLength);
      }
    }

    _createRefReader(atIndex: number): Reader<boolean> {
      const { currentOffset, currentType } = this;
      const {
        size,
        children: [nextType]
      } = currentType as SchemaCompoundType<'Ref'>;
      const isUndefined = this.isUndefined(atIndex);
      const offset = currentOffset + atIndex * size;
      const nextOffset = isUndefined ? -1 : dataView.getInt32(offset, true);
      const nextIndex = isUndefined ? -1 : dataView.getInt32(offset + 4, true);
      const nextLength = isUndefined ? 0 : MAX_INT32;
      return new Reader(nextType, nextOffset, nextIndex, nextLength);
    }

    _createLinkReader(atIndex: number): Reader<boolean> {
      const { currentOffset, currentType } = this;
      const { size, children } = currentType as SchemaCompoundType<'Link'>;
      const [schemaKey, nextType] = children[0].split('/');
      const isUndefined = this.isUndefined(atIndex);
      const offset = currentOffset + atIndex * size;
      const nextOffset = isUndefined ? -1 : dataView.getInt32(offset, true);
      const nextIndex = isUndefined ? -1 : dataView.getInt32(offset + 4, true);
      const nextLength = isUndefined ? 0 : MAX_INT32;

      if (schemaKey in linkedReaders) {
        const LinkedReader = linkedReaders[schemaKey];
        return new LinkedReader(nextType, nextOffset, nextIndex, nextLength);
      } else {
        if (getCalledInternally) {
          return this as Reader<boolean>;
        } else {
          throw new TraversalError(`Reader not found for link ${children}`);
        }
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

    static addLink(schema: string, LinkedReader: typeof Reader) {
      linkedReaders[schema] = LinkedReader;
    }
  }

  class NestedReader extends Reader<Multiple> {
    readers: NestedLazyArray<Reader<boolean>>;
    ref: Reader<boolean>;

    constructor(readers: NestedLazyArray<Reader<boolean>>) {
      const ref = LazyArray.nestedReduce(
        readers,
        (acc, getReader) => acc || getReader(),
        undefined as Reader<boolean> | undefined
      );
      if (!ref) {
        throw new TraversalError('Cannot create empty NestedReader');
      }
      super(
        ref.typeName,
        ref.currentOffset,
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
      if (!this.isBranched()) return this;
      LazyArray.nestedForEach(this.readers, reader => {
        if (reader.isBranched()) reader.switchBranch(branchIndex);
      });
      this.typeName = this.ref.typeName;
      this.currentOffset = this.ref.currentOffset;
      return this;
    }

    value<U = any>(defaultValue?: any) {
      return LazyArray.nestedMap(this.readers, reader =>
        reader.value()
      ) as ValueReturnType<U, Multiple>;
    }

    get<K extends Key>(key: K): Reader<boolean> {
      const readers = LazyArray.nestedMap(this.readers, reader => {
        const nextReader = reader.get(key);
        return (
          nextReader instanceof NestedReader ? nextReader.readers : nextReader
        ) as Reader<boolean>;
      });
      return new NestedReader(readers);
    }
  }

  class BranchedReader extends Reader<Multiple> {
    branches: Reader<Multiple>[];
    currentBranch: number;
    discriminator: Iterable<number>;

    constructor(
      branches: Reader<Multiple>[],
      currentBranch: number,
      discriminator: Iterable<number>
    ) {
      const branch = branches[currentBranch];
      super(
        branch.typeName,
        branch.currentOffset,
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
      this.currentType = branch.currentType;
      this.currentOffset = branch.currentOffset;
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

    value<U = any>() {
      const { currentLength } = this;
      const branchValues = this.branches.map(branch => branch.value());
      const discriminatorValue = this._freezeDiscriminator();
      const getter = (i: number) => branchValues[discriminatorValue[i]].get(i);
      return new LazyArray<U>(getter, currentLength);
    }

    _freezeDiscriminator() {
      const { discriminator, currentLength } = this;
      const frozen = new Uint8Array(currentLength);
      let i = 0;
      for (const index of discriminator) {
        if (i >= currentLength) break;
        frozen[i++] = index;
      }
      this.discriminator = frozen as Iterable<number>;
      return frozen;
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
        const nextType = children[discriminator];
        const nextOffset = currentOffset + discriminator * size;
        const nextReader = new Reader(
          nextType,
          nextOffset,
          nextIndex,
          currentLength
        );
        return nextReader;
      } else {
        const discriminator = indexToOneOf(length, ...bitmasks);
        const forwardMaps = forwardMapOneOf(length, ...bitmasks);

        const branches = children.map((nextType, i) => {
          const nextIndex = chainForwardIndexes(
            root.currentIndex as Iterable<number>,
            forwardMaps[i]
          );
          const nextOffset = currentOffset + i * 12;
          const nextReader = new Reader<Multiple>(
            nextType,
            nextOffset,
            nextIndex,
            currentLength
          );
          return nextReader;
        });

        return new BranchedReader(branches, 0, discriminator);
      }
    }
  }

  const linkedReaders: Record<string, typeof Reader> = {};
  return Reader;
}

export type Reader = ReturnType<typeof createReader>;

export function linkReaders(Readers: Record<string, Reader>) {
  const schemaKeys = Object.keys(Readers);
  schemaKeys.forEach(keyA => {
    schemaKeys.forEach(keyB => {
      if (keyA === keyB) return;
      Readers[keyA].addLink(keyB, Readers[keyB]);
      Readers[keyB].addLink(keyA, Readers[keyA]);
    });
  });
}

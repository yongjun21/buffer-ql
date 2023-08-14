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
import { readString } from '../helpers/io.js';

import { TypeError, UsageError, InternalError } from '../helpers/error.js';

import type {
  Schema,
  SchemaPrimitiveType,
  SchemaCompoundType,
  SchemaNamedTupleType
} from '../schema/index.js';

type Single = true;
type Multiple = false;
type IndexType<T extends boolean> = T extends Single ? number : Int32Array;
type ValueReturnType<U, T extends boolean> = T extends Single
  ? U
  : NestedLazyArray<U>;

export const ALL_KEYS = Symbol('ALL_KEYS');
export const ALL_VALUES = Symbol('ALL_VALUES');
export const NULL_VALUE = Symbol('NULL_VALUE');

type Key = string | number | symbol | string[] | number[];

type ValueCallStack<Reader> = [
  Reader,
  Record<string | number, any>,
  string | number
][];

export class Reader<T extends boolean = Single> {
  static dataView: DataView = new DataView(new Uint8Array(0).buffer);
  static schema: Schema = {};
  static linkedReaders: Record<string, any> = {};
  static _getCalledInternally = false;

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
    const { schema } = this.constructor as typeof Reader;
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

  isUndefined(atIndex: number | Int32Array = this.currentIndex) {
    return (
      this.currentOffset < 0 ||
      this.currentLength <= 0 ||
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
        : new LazyArray<U>(
            i => this._valueAt(i),
            this.currentIndex as Int32Array
          )
    ) as ValueReturnType<U, T>;
  }

  private _valueAt<U = any>(atIndex: number): U {
    const NextReader = this.constructor as typeof Reader;
    const { typeName, currentOffset, currentLength } = this;
    const root: U[] = [];
    const currentStack: ValueCallStack<Reader<boolean>> = [];
    currentStack.push([
      new NextReader(typeName, currentOffset, atIndex, currentLength),
      root,
      0
    ]);
    while (currentStack.length > 0) {
      const [currentReader, parent, key] = currentStack.pop()!;
      currentReader._value(parent, key, currentStack);
    }
    return root[0];
  }

  private _value(
    parent: Record<string | number, any>,
    key: string | number,
    currentStack: ValueCallStack<Reader<boolean>>
  ): void {
    if (!this.singleValue()) return;
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
    const { currentType, currentOffset, currentIndex } = this;
    if (this.isUndefined()) return;
    if (this.isPrimitive()) {
      const { size, decode } = currentType as SchemaPrimitiveType;
      parent[key] = decode(dataView, currentOffset + currentIndex * size);
    } else if (this.isTuple()) {
      const { children } = currentType as SchemaCompoundType<'Tuple'>;
      parent[key] = [];
      for (let k = children.length - 1; k >= 0; k--) {
        currentStack.push([this.get(k), parent[key], k]);
      }
    } else if (this.isNamedTuple()) {
      const { children, keys } = currentType as SchemaNamedTupleType;
      parent[key] = {};
      for (let k = children.length - 1; k >= 0; k--) {
        const childKey = keys[k];
        currentStack.push([this.get(key), parent[key], childKey]);
      }
    } else if (this.isArray()) {
      parent[key] = this.get(ALL_VALUES).value();
    } else if (this.isMap()) {
      const childKeys = this.get(ALL_KEYS).value<string>() as LazyArray<string>;
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
  ): K extends typeof ALL_KEYS | typeof ALL_VALUES | any[]
    ? Reader<Multiple>
    : Reader<T> {
    if (Array.isArray(key) && !this.isArray() && !this.isMap()) {
      throw new UsageError('Only Array or Map type supports multi-key access');
    }

    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
    const { currentType, currentOffset, currentIndex, currentLength } = this;
    let nextReader: Reader<boolean>;
    if (this.isTuple()) {
      if (typeof key !== 'number') {
        throw new UsageError('Tuple type can only be accessed by index');
      }
      const i = key;
      const { size, children } = currentType as SchemaCompoundType<'Tuple'>;
      if (i < 0 || i >= children.length) {
        throw new UsageError(`Index ${i} is out of bounds`);
      }
      const nextType = children[i];
      const nextOffset = this.isUndefined() ? -1 : currentOffset + i * size;

      nextReader = new NextReader(
        nextType,
        nextOffset,
        currentIndex,
        currentLength
      );
    } else if (this.isNamedTuple()) {
      if (typeof key !== 'string') {
        throw new UsageError('Named tuple type can only be accessed by key');
      }
      const { size, children, indexes } = currentType as SchemaNamedTupleType;
      if (!(key in indexes)) {
        throw new UsageError(`Undefined key ${key}`);
      }
      const i = indexes[key];
      const nextType = children[i];
      const nextOffset = this.isUndefined() ? -1 : currentOffset + i * size;

      nextReader = new NextReader(
        nextType,
        nextOffset,
        currentIndex,
        currentLength
      );
    } else if (this.isArray()) {
      if (this.singleValue()) {
        nextReader = this._arrayReaderGet(this.currentIndex, key);
      } else {
        nextReader = new NestedReader(
          new LazyArray(
            i => this._arrayReaderGet(i, key),
            currentIndex as Int32Array
          )
        );
      }
    } else if (this.isMap()) {
      if (this.singleValue()) {
        nextReader = this._mapReaderGet(this.currentIndex, key);
      } else {
        nextReader = new NestedReader(
          new LazyArray(
            i => this._mapReaderGet(i, key),
            currentIndex as Int32Array
          )
        );
      }
    } else if (this.isOptional()) {
      const {
        children: [nextType]
      } = currentType as SchemaCompoundType<'Optional'>;
      const bitmaskOffset = dataView.getInt32(currentOffset, true);
      const bitmaskLength = dataView.getInt32(currentOffset + 4, true);
      const nextOffset = dataView.getInt32(currentOffset + 8, true);
      const bitmask = decodeBitmask(
        new Uint8Array(dataView.buffer, bitmaskOffset, bitmaskLength),
        currentLength
      );
      const nextIndex = this.singleValue()
        ? forwardMapSingleIndex(bitmask, this.currentIndex)
        : chainForwardIndexes(
            currentLength,
            currentIndex as Int32Array,
            forwardMapIndexes(currentLength, bitmask)
          ).asInt32Array();

      nextReader = new NextReader<boolean>(
        nextType,
        nextOffset,
        nextIndex,
        currentLength
      );
    } else if (this.isOneOf()) {
      return BranchedReader.from(this) as Reader<boolean>;
    } else if (this.isRef()) {
      if (this.singleValue()) {
        nextReader = this._refReaderGet(this.currentIndex);
      } else {
        nextReader = new NestedReader(
          new LazyArray(i => this._refReaderGet(i), currentIndex as Int32Array)
        );
      }
    } else if (this.isLink()) {
      if (this.singleValue()) {
        nextReader = this._linkReaderGet(this.currentIndex);
      } else {
        nextReader = new NestedReader(
          new LazyArray(i => this._linkReaderGet(i), currentIndex as Int32Array)
        );
      }
    } else {
      throw new UsageError('Primitive types cannot be traversed further');
    }
    NextReader._getCalledInternally = true;
    if (nextReader.isOptional()) return nextReader.get(NULL_VALUE);
    if (nextReader.isOneOf()) return nextReader.get(NULL_VALUE);
    if (nextReader.isLink()) return nextReader.get(NULL_VALUE);
    NextReader._getCalledInternally = false;
    return nextReader;
  }

  dump() {
    if (!this.isPrimitive()) {
      throw new UsageError('Calling dump on a non-primitive type');
    }
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
    const [offset, length] = this._computeDump();
    return length > 0
      ? new Uint8Array(dataView.buffer, offset, length)
      : new Uint8Array(0);
  }

  protected _computeDump() {
    const { currentOffset, currentType, currentIndex, currentLength } = this;
    const { size } = currentType as SchemaPrimitiveType;

    if (this.singleValue()) {
      const index = currentIndex as number;
      return index < 0 || index >= currentLength
        ? [-1, 0]
        : [currentOffset + index * size, size];
    }

    let offset = -1;
    let lastIndex = -1;
    let length = 0;
    for (const index of currentIndex as Int32Array) {
      if (index < 0 || index >= currentLength) continue;
      if (offset < 0) {
        offset = currentOffset + index * size;
        lastIndex = index;
      } else if (index > lastIndex + 1) {
        throw new UsageError('Calling dump on non-contiguous block');
      }
      length += size;
    }
    return [offset, length];
  }

  private _arrayReaderGet(atIndex: number, i: Key): Reader<boolean> {
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
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
      if (i instanceof Int32Array) {
        return new NextReader(nextType, nextOffset, i, nextLength);
      }

      if (Array.isArray(i)) {
        for (const v of i) {
          if (typeof v !== 'number') {
            throw new UsageError(
              'Index must be a number, a set of numbers or ALL_VALUES'
            );
          }
        }
        const nextIndex = new Int32Array(i as number[]);
        return new NextReader(nextType, nextOffset, nextIndex, nextLength);
      }
  
      if (i !== ALL_VALUES) {
        throw new UsageError(
          `Index must be a number, a set of numbers or ALL_VALUES`
        );
      }
      const nextIndex = getDefaultIndexMap(nextLength);
      return new NextReader(nextType, nextOffset, nextIndex, nextLength);
    }

    return new NextReader(nextType, nextOffset, i, nextLength);
  }

  private _mapReaderGet(atIndex: number, k: Key): Reader<boolean> {
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
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

    const getIndex = (k: string) => {
      for (let i = 0; i < nextLength; i++) {
        if (k === readString(dataView, offsetToKeys + i * 8)) return i;
      }
      return -1;
    };

    if (typeof k !== 'string') {
      if (k instanceof Int32Array) {
        return new NextReader(nextType, offsetToValues, k, nextLength);
      }

      if (Array.isArray(k)) {
        for (const v of k) {
          if (typeof v !== 'string') {
            throw new UsageError(
              'Key must be a string, a set of strings, ALL_VALUES or ALL_KEYS'
            );
          }
        }
        const nextIndex = new Int32Array((k as string[]).map(getIndex));
        return new NextReader(nextType, offsetToValues, nextIndex, nextLength);
      }
  
      if (k !== ALL_VALUES && k !== ALL_KEYS) {
        throw new UsageError(
          `Key must be a string, a set of strings or ALL_VALUES or ALL_KEYS`
        );
      }
      const nextIndex = getDefaultIndexMap(nextLength);
      return new NextReader(
        k === ALL_KEYS ? 'String' : nextType,
        k === ALL_KEYS ? offsetToKeys : offsetToValues,
        nextIndex,
        nextLength
      );
    }

    return new NextReader(nextType, offsetToValues, getIndex(k), nextLength);
  }

  private _refReaderGet(atIndex: number): Reader<boolean> {
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
    const { currentType, currentOffset } = this;
    const {
      size,
      children: [nextType]
    } = currentType as SchemaCompoundType<'Ref'>;
    const isUndefined = this.isUndefined(atIndex);
    const offset = currentOffset + atIndex * size;
    const nextOffset = isUndefined ? -1 : dataView.getInt32(offset, true);
    const nextIndex = isUndefined ? -1 : dataView.getInt32(offset + 4, true);
    return new NextReader(nextType, nextOffset, nextIndex, 1);
  }

  private _linkReaderGet(atIndex: number): Reader<boolean> {
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
    const { currentType, currentOffset } = this;
    const { size, children } = currentType as SchemaCompoundType<'Link'>;
    const [schemaKey, nextType] = children[0].split('/');
    const isUndefined = this.isUndefined(atIndex);
    const offset = currentOffset + atIndex * size;
    const nextOffset = isUndefined ? -1 : dataView.getInt32(offset, true);
    const nextIndex = isUndefined ? -1 : dataView.getInt32(offset + 4, true);

    if (schemaKey in NextReader.linkedReaders) {
      const LinkedReader = NextReader.linkedReaders[schemaKey];
      return new LinkedReader(nextType, nextOffset, nextIndex, 1);
    } else {
      if (NextReader._getCalledInternally) {
        return this as Reader<boolean>;
      } else {
        throw new UsageError(`Reader not found for link ${children}`);
      }
    }
  }

  static addLink(schema: string, LinkedReader: typeof Reader) {
    this.linkedReaders[schema] = LinkedReader;
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
      throw new InternalError('Cannot create empty NestedReader');
    }
    super(ref.typeName, ref.currentOffset, ref.currentIndex, ref.currentLength);
    this.readers = readers;
    this.ref = ref;
  }

  singleValue() {
    return false;
  }

  isBranched() {
    return this.ref.isBranched();
  }

  switchBranch(branchIndex: number) {
    if (!this.isBranched()) return this;
    LazyArray.nestedForEach(this.readers, reader => {
      if (reader.isBranched()) reader.switchBranch(branchIndex);
    });
    this.typeName = this.ref.typeName;
    this.currentType = this.ref.currentType;
    this.currentOffset = this.ref.currentOffset;
    return this;
  }

  value<U = any>() {
    return LazyArray.nestedMap(this.readers, reader =>
      reader.value()
    ) as ValueReturnType<U, Multiple>;
  }

  get<K extends Key>(key: K) {
    const readers = LazyArray.nestedMap(this.readers, reader => {
      const nextReader = reader.get(key);
      return (
        nextReader instanceof NestedReader ? nextReader.readers : nextReader
      ) as Reader<boolean>;
    });
    return new NestedReader(readers);
  }

  _computeDump() {
    let offset = -1;
    let length = 0;
    for (const reader of LazyArray.iterateNested(this.readers)) {
      const [nextOffset, nextLength] = (reader as NestedReader)._computeDump();
      if (offset < 0) {
        offset = nextOffset;
      } else if (nextOffset > offset + length) {
        throw new UsageError('Calling dump on non-contiguous block');
      }
      length += nextLength;
    }
    return [offset, length];
  }
}

class BranchedReader extends Reader<Multiple> {
  branches: Reader<Multiple>[];
  currentBranch: number;
  discriminator: Uint8Array;
  rootIndex: Int32Array;

  constructor(
    branches: Reader<Multiple>[],
    currentBranch: number,
    discriminator: Uint8Array,
    rootIndex: Int32Array
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
    this.rootIndex = rootIndex;
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

  value<U = any>() {
    const { discriminator, rootIndex } = this;
    const branchValues = this.branches.map(branch => branch.value());
    const getter = (i: number) => {
      const branchIndex = discriminator[i];
      if (branchIndex == null) return undefined;
      return branchValues[branchIndex].get(i);
    };
    return new LazyArray<U>(getter, rootIndex);
  }

  get(key: Key) {
    const next = super.get(key);
    const nextBranches = [...this.branches];
    nextBranches[this.currentBranch] = next;
    return new BranchedReader(
      nextBranches,
      this.currentBranch,
      this.discriminator,
      this.rootIndex
    );
  }

  static from<T extends boolean>(root: Reader<T>) {
    if (!root.isOneOf()) {
      throw new InternalError(`Expects OneOf type`);
    }

    const NextReader = root.constructor as typeof Reader;
    const { dataView } = NextReader;
    const { currentOffset, currentType, currentIndex, currentLength } = root;
    const { size, children } = currentType as SchemaCompoundType<'OneOf'>;

    const bitmasks: Uint8Array[] = [];
    for (let i = 0; i < children.length - 1; i++) {
      const bitmaskOffset = dataView.getInt32(
        currentOffset + i * size + 4,
        true
      );
      const bitmaskLength = dataView.getInt32(
        currentOffset + i * size + 8,
        true
      );
      bitmasks.push(
        new Uint8Array(dataView.buffer, bitmaskOffset, bitmaskLength)
      );
    }

    if (root.singleValue()) {
      const [discriminator, nextIndex] = forwardMapSingleOneOf(
        currentIndex as number,
        ...bitmasks
      );
      const nextType = children[discriminator];
      const nextOffset = currentOffset + discriminator * size;
      return new NextReader(nextType, nextOffset, nextIndex, currentLength);
    } else {
      const discriminator = indexToOneOf(
        currentLength,
        ...bitmasks
      ).asUint8Array();
      const forwardMaps = forwardMapOneOf(currentLength, ...bitmasks);

      const branches = children.map((nextType, i) => {
        const nextIndex = forwardMaps[i].asInt32Array();
        const nextOffset = dataView.getInt32(currentOffset + i * size, true);
        return new NextReader<Multiple>(
          nextType,
          nextOffset,
          nextIndex,
          currentLength
        );
      });

      return new BranchedReader(
        branches,
        0,
        discriminator,
        currentIndex as Int32Array
      );
    }
  }
}

export function createReader(data: ArrayBuffer | DataView, schema: Schema) {
  const dataView = data instanceof DataView ? data : new DataView(data);
  class _Reader extends Reader {
    static dataView = dataView;
    static schema = schema;
    static linkedReaders = super.linkedReaders;
    static _getCalledInternally = super._getCalledInternally;
  }
  return _Reader as typeof Reader;
}

export function linkReaders(Readers: Record<string, typeof Reader>) {
  const schemaKeys = Object.keys(Readers);
  schemaKeys.forEach(keyA => {
    schemaKeys.forEach(keyB => {
      if (keyA === keyB) return;
      Readers[keyA].addLink(keyB, Readers[keyB]);
      Readers[keyB].addLink(keyA, Readers[keyA]);
    });
  });
}

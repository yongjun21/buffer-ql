import { LazyArray, getDefaultIndexMap, NestedLazyArray } from './LazyArray.js';

import {
  decodeBitmask,
  forwardMapIndexes,
  forwardMapSingleIndex,
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

import type { TypedArrayConstructor } from '../types/common.js';

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

    const isBaseReader =
      !(this instanceof NestedReader) && !(this instanceof BranchedReader);
    if (isBaseReader && !(type in schema)) {
      throw new TypeError(`Missing type definition ${type} in schema`);
    }

    this.typeName = type;
    this.currentType = schema[type];
    this.currentOffset = offset;
    this.currentIndex = index as IndexType<T>;
    this.currentLength = length;

    if (isBaseReader) {
      if (this.isOptional()) return this.get(NULL_VALUE);
      if (this.isOneOf()) return this.get(NULL_VALUE);
      if (this.isRef()) return this.get(NULL_VALUE);
      if (this.isLink()) return this.get(NULL_VALUE);
    }
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
      (typeof atIndex === 'number' &&
        (atIndex < 0 || atIndex >= this.currentLength))
    );
  }

  isBranched(): this is BranchedReader<T> {
    return false;
  }

  value<U = any>(): ValueReturnType<U, T> | undefined {
    if (this.isPrimitive()) {
      return this.singleValue()
        ? this._primitiveValueAt(this.currentIndex)
        : new LazyArray<U>(
            i => this._primitiveValueAt(i),
            this.currentIndex as Int32Array
          );
    }
    const refCache = createRefCache();
    return (
      this.singleValue()
        ? this._compoundValueAt(this.currentIndex, refCache)
        : new LazyArray<U>(
            i => this._compoundValueAt(i, refCache),
            this.currentIndex as Int32Array
          )
    ) as ValueReturnType<U, T>;
  }

  private _primitiveValueAt(atIndex: number) {
    if (this.isUndefined(atIndex)) return;
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
    const { currentType, currentOffset } = this;
    const { size, decode } = currentType as SchemaPrimitiveType;
    return decode(dataView, currentOffset + atIndex * size);
  }

  private _compoundValueAt<U = any>(
    atIndex: number,
    refCache = createRefCache()
  ): U {
    const root: U[] = [];
    const currentStack: ValueCallStack<Reader<boolean>> = [];
    if (atIndex === this.currentIndex) {
      currentStack.push([this, root, 0]);
    } else {
      const NextReader = this.constructor as typeof Reader;
      const { typeName, currentOffset, currentLength } = this;
      currentStack.push([
        new NextReader(typeName, currentOffset, atIndex, currentLength),
        root,
        0
      ]);
    }
    while (currentStack.length > 0) {
      const [currentReader, parent, key] = currentStack.pop()!;
      currentReader._value(parent, key, currentStack, refCache);
    }
    return root[0];
  }

  private _value(
    parent: Record<string | number, any>,
    key: string | number,
    currentStack: ValueCallStack<Reader<boolean>>,
    refCache = createRefCache()
  ): void {
    if (!this.singleValue()) return;
    if (this.isUndefined()) return;

    const { currentType, currentOffset, currentIndex } = this;

    let setCache: (value: any) => void = v => v;
    if (currentType.ref) {
      const cached = refCache.get(currentOffset, currentIndex);
      if (cached) {
        parent[key] = cached;
        return;
      } else {
        setCache = refCache.set(currentOffset, currentIndex);
      }
    }

    if (this.isPrimitive()) {
      parent[key] = this._primitiveValueAt(currentIndex);
    } else if (this.isTuple()) {
      const { children } = currentType as SchemaCompoundType<'Tuple'>;
      parent[key] = setCache([]);
      for (let k = children.length - 1; k >= 0; k--) {
        currentStack.push([this.get(k), parent[key], k]);
      }
    } else if (this.isNamedTuple()) {
      const { children, keys } = currentType as SchemaNamedTupleType;
      parent[key] = setCache({});
      for (let k = children.length - 1; k >= 0; k--) {
        const childKey = keys[k];
        currentStack.push([this.get(childKey), parent[key], childKey]);
      }
    } else if (this.isArray()) {
      parent[key] = setCache(this.get(ALL_VALUES).value());
    } else if (this.isMap()) {
      const childKeys = this.get(ALL_KEYS).value<string>() as LazyArray<string>;
      parent[key] = setCache({});
      for (let k = childKeys.length - 1; k >= 0; k--) {
        const childKey = childKeys.get(k);
        currentStack.push([this.get(childKey), parent[key], childKey]);
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
      const nextOffset = this.isUndefined()
        ? -1
        : dataView.getInt32(currentOffset + i * size, true);

      return new NextReader(nextType, nextOffset, currentIndex, currentLength);
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
      const nextOffset = this.isUndefined()
        ? -1
        : dataView.getInt32(currentOffset + i * size, true);

      return new NextReader(nextType, nextOffset, currentIndex, currentLength);
    } else if (this.isArray()) {
      if (this.singleValue()) {
        return this._arrayReaderGet(this.currentIndex, key);
      } else {
        return new NestedReader(
          new LazyArray(
            i => this._arrayReaderGet(i, key),
            currentIndex as Int32Array
          ),
          this._arrayReaderGet(-1, key)
        ) as Reader<boolean>;
      }
    } else if (this.isMap()) {
      if (this.singleValue()) {
        return this._mapReaderGet(this.currentIndex, key);
      } else {
        return new NestedReader(
          new LazyArray(
            i => this._mapReaderGet(i, key),
            currentIndex as Int32Array
          ),
          this._mapReaderGet(-1, key)
        ) as Reader<boolean>;
      }
    } else if (this.isOptional()) {
      const {
        children: [nextType]
      } = currentType as SchemaCompoundType<'Optional'>;

      if (this.isUndefined()) return new NextReader(nextType, -1, -1, 0);

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
            currentIndex as Int32Array,
            forwardMapIndexes(
              getMaxIndex(currentIndex as Int32Array) + 1,
              bitmask
            ).asInt32Array()
          );

      return new NextReader<boolean>(
        nextType,
        nextOffset,
        nextIndex,
        currentLength
      );
    } else if (this.isOneOf()) {
      return BranchedReader.from(this) as Reader<boolean>;
    } else if (this.isRef()) {
      if (this.singleValue()) {
        return this._refReaderGet(this.currentIndex);
      } else {
        return new NestedReader(
          new LazyArray(i => this._refReaderGet(i), currentIndex as Int32Array),
          this._refReaderGet(-1)
        ) as Reader<boolean>;
      }
    } else if (this.isLink()) {
      if (this.singleValue()) {
        return this._linkReaderGet(this.currentIndex);
      } else {
        return new NestedReader(
          new LazyArray(
            i => this._linkReaderGet(i),
            currentIndex as Int32Array
          ),
          this._linkReaderGet(-1)
        ) as Reader<boolean>;
      }
    } else {
      throw new UsageError('Primitive types cannot be traversed further');
    }
  }

  dump(TypedArray: TypedArrayConstructor = Uint8Array) {
    if (!this.isPrimitive()) {
      throw new UsageError('Calling dump on a non-primitive type');
    }
    const NextReader = (
      this instanceof NestedReader
        ? this.ref.constructor
        : this instanceof BranchedReader
        ? this.branches[this.currentBranch].constructor
        : this.constructor
    ) as typeof Reader;
    const { dataView } = NextReader;
    const [offset, length] = this._computeDump();
    return length > 0
      ? new TypedArray(
          dataView.buffer,
          offset,
          length / TypedArray.BYTES_PER_ELEMENT
        )
      : new TypedArray(0);
  }

  protected _computeDump() {
    const { currentOffset, currentType, currentIndex, currentLength } = this;
    const { size } = currentType as SchemaPrimitiveType;

    if (this.singleValue()) {
      const index = this.currentIndex as number;
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
      } else if (index > lastIndex + 1) {
        throw new UsageError('Calling dump on non-contiguous block');
      }
      length += size;
      lastIndex = index;
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

    const nextIndex = this._validateArrayKey(i);

    if (this.isUndefined(atIndex)) return new NextReader(nextType, -1, -1, 0);

    const offset = currentOffset + atIndex * size;
    const nextOffset = dataView.getInt32(offset, true);
    const nextLength = dataView.getInt32(offset + 4, true);
    return new NextReader(
      nextType,
      nextOffset,
      nextIndex ?? getDefaultIndexMap(nextLength),
      nextLength
    );
  }

  private _validateArrayKey(i: Key): IndexType<boolean> | undefined {
    if (i instanceof Int32Array) return i;
    if (typeof i === 'number') return i;
    if (Array.isArray(i)) {
      for (const v of i) {
        if (typeof v !== 'number') {
          throw new UsageError(
            'Index must be a number, a set of numbers or ALL_VALUES'
          );
        }
      }
      return new Int32Array(i as number[]);
    }
    if (i !== ALL_VALUES) {
      throw new UsageError(
        `Index must be a number, a set of numbers or ALL_VALUES`
      );
    }
  }

  private _mapReaderGet(atIndex: number, k: Key): Reader<boolean> {
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
    const { currentType, currentOffset } = this;
    const {
      size,
      children: [nextType]
    } = currentType as SchemaCompoundType<'Array'>;

    const getNextIndex = this._validateMapKey(k);

    if (this.isUndefined(atIndex)) return new NextReader(nextType, -1, -1, 0);

    const offset = currentOffset + atIndex * size;
    const offsetToKeys = dataView.getInt32(offset, true);
    const offsetToValues = dataView.getInt32(offset + 4, true);
    const nextLength = dataView.getInt32(offset + 8, true);
    const getIndex = (k: string) => {
      for (let i = 0; i < nextLength; i++) {
        if (k === readString(dataView, offsetToKeys + i * 8)) return i;
      }
      return -1;
    };

    return new NextReader(
      k === ALL_KEYS ? 'String' : nextType,
      k === ALL_KEYS ? offsetToKeys : offsetToValues,
      getNextIndex(getIndex) ?? getDefaultIndexMap(nextLength),
      nextLength
    );
  }

  private _validateMapKey(
    k: Key
  ): (getIndex: (k: string) => number) => IndexType<boolean> | undefined {
    if (k instanceof Int32Array) return () => k;
    if (typeof k === 'string') return getIndex => getIndex(k);
    if (Array.isArray(k)) {
      for (const v of k) {
        if (typeof v !== 'string') {
          throw new UsageError(
            'Key must be a string, a set of strings, ALL_VALUES or ALL_KEYS'
          );
        }
      }
      return getIndex => new Int32Array((k as string[]).map(getIndex));
    }
    if (k !== ALL_VALUES && k !== ALL_KEYS) {
      throw new UsageError(
        `Key must be a string, a set of strings or ALL_VALUES or ALL_KEYS`
      );
    }
    return () => undefined;
  }

  private _refReaderGet(atIndex: number): Reader<boolean> {
    const NextReader = this.constructor as typeof Reader;
    const { dataView } = NextReader;
    const { currentType, currentOffset } = this;
    const {
      size,
      children: [nextType]
    } = currentType as SchemaCompoundType<'Ref'>;

    if (this.isUndefined(atIndex)) return new NextReader(nextType, -1, -1, 0);

    const offset = currentOffset + atIndex * size;
    const nextOffset = dataView.getInt32(offset, true);
    const nextIndex = dataView.getInt32(offset + 4, true);
    return new NextReader(nextType, nextOffset, nextIndex, nextIndex + 1);
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
      return new LinkedReader(nextType, nextOffset, nextIndex, nextIndex + 1);
    } else if (this.isUndefined()) {
      return this as Reader<boolean>;
    } else {
      throw new UsageError(`Reader not found for link ${children}`);
    }
  }

  static addLink(schema: string, LinkedReader: typeof Reader) {
    this.linkedReaders[schema] = LinkedReader;
  }
}

class NestedReader extends Reader<Multiple> {
  readers: NestedLazyArray<Reader<boolean>>;
  ref: Reader<boolean>;

  constructor(readers: NestedLazyArray<Reader<boolean>>, ref: Reader<boolean>) {
    super(ref.typeName, ref.currentOffset, ref.currentIndex, ref.currentLength);
    this.currentType = ref.currentType;
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
    (this.ref as BranchedReader<boolean>).switchBranch(branchIndex);
    this.typeName = this.ref.typeName;
    this.currentType = this.ref.currentType;
    return this;
  }

  value<U = any>() {
    return LazyArray.nestedMap(this.readers, reader =>
      reader.value()
    ) as ValueReturnType<U, Multiple>;
  }

  get(key: Key) {
    const nextReaders = LazyArray.nestedMap(this.readers, reader => {
      const nextReader = reader.get(key);
      return (
        nextReader instanceof NestedReader ? nextReader.readers : nextReader
      ) as Reader<boolean>;
    });
    const nextRef = this.ref.get(key);
    return new NestedReader(nextReaders, nextRef);
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

class BranchedReader<T extends boolean> extends Reader<T> {
  branches: Reader<T>[];
  currentBranch: number;
  discriminator: T extends Single ? number : Uint8Array;
  rootIndex: IndexType<T>;

  constructor(
    branches: Reader<T>[],
    currentBranch: number,
    discriminator: T extends Single ? number : Uint8Array,
    rootIndex: IndexType<T>
  ) {
    const branch = branches[currentBranch];
    super(
      branch.typeName,
      branch.currentOffset,
      branch.currentIndex,
      branch.currentLength
    );
    this.currentType = branch.currentType;
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
    if (this.singleValue()) {
      return this.branches[discriminator as number].value();
    } else {
      const branchValues = this.branches.map(branch => branch.value());
      const getter = (i: number) => {
        const branchIndex = (discriminator as Uint8Array)[i];
        if (branchIndex == null) return undefined;
        return branchValues[branchIndex]?.get(i);
      };
      return new LazyArray<U>(getter, rootIndex);
    }
  }

  get(key: Key): Reader<boolean> {
    const next = super.get(key) as Reader<T>;
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

    if (root.isUndefined()) return new NextReader(children[0], -1, -1, 0);

    const bitmasks: Iterable<number>[] = [];
    for (let i = 0; i < children.length - 1; i++) {
      const offset = currentOffset + i * size;
      const bitmaskOffset = dataView.getInt32(offset + 4, true);
      const bitmaskLength = dataView.getInt32(offset + 8, true);
      const bitmask = decodeBitmask(
        new Uint8Array(dataView.buffer, bitmaskOffset, bitmaskLength),
        currentLength
      );
      bitmasks.push(bitmask);
    }

    if (root.singleValue()) {
      const _currentIndex = currentIndex as number;

      const [discriminator, branchNextIndex] = forwardMapSingleOneOf(
        _currentIndex,
        ...bitmasks
      );

      const branches = children.map((nextType, i) => {
        const offset = currentOffset + i * size;
        const nextOffset = dataView.getInt32(offset, true);
        return new NextReader<Single>(
          nextType,
          nextOffset,
          i === discriminator ? branchNextIndex : -1,
          currentLength
        );
      });

      return new BranchedReader(branches, 0, discriminator, _currentIndex);
    } else {
      const _currentIndex = currentIndex as Int32Array;
      const maxIndex = getMaxIndex(_currentIndex);

      const discriminator = indexToOneOf(
        maxIndex + 1,
        ...bitmasks
      ).asUint8Array();
      const forwardMaps = forwardMapOneOf(maxIndex + 1, ...bitmasks);

      const branches = children.map((nextType, i) => {
        const nextIndex = forwardMaps[i].asInt32Array();
        const offset = currentOffset + i * size;
        const nextOffset = dataView.getInt32(offset, true);
        return new NextReader<Multiple>(
          nextType,
          nextOffset,
          nextIndex,
          currentLength
        );
      });

      return new BranchedReader(branches, 0, discriminator, _currentIndex);
    }
  }
}

export function createReader(data: ArrayBuffer | DataView, schema: Schema) {
  const dataView = data instanceof DataView ? data : new DataView(data);
  class _Reader extends Reader {
    static dataView = dataView;
    static schema = schema;
    static linkedReaders = super.linkedReaders;
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

function createRefCache() {
  const cache = new Map<number, Map<number, any>>();
  return {
    get(offset: number, index: number) {
      if (!cache.has(offset)) return undefined;
      return cache.get(offset)!.get(index);
    },
    set(offset: number, index: number) {
      if (!cache.has(offset)) cache.set(offset, new Map());
      const cached = cache.get(offset)!;
      return (value: any) => {
        cached.set(index, value);
        return value;
      };
    }
  };
}

function getMaxIndex(indexes: Int32Array) {
  let max = -1;
  for (const i of indexes) {
    if (i > max) max = i;
  }
  return max;
}

function chainForwardIndexes(a: Int32Array, b: Int32Array) {
  return a.map(i => (i < 0 ? -1 : b[i]));
}

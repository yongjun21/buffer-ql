import { ReaderApply } from './ReaderApply.js';
import { LazyArray, getDefaultIndexMap } from './LazyArray.js';

import {
  decodeBitmask,
  decodeOneOf,
  forwardMapIndexes,
  forwardMapSingleIndex,
  indexToOneOf,
  forwardMapOneOf,
  forwardMapSingleOneOf
} from '../helpers/bitmask.js';
import { readString, readVarint, DataTape } from '../helpers/io.js';

import { TypeError, UsageError, InternalError } from '../helpers/error.js';

import type {
  Schema,
  SchemaPrimitiveType,
  SchemaCompoundType,
  SchemaNamedTupleType
} from '../schema/index.js';

import type { TypedArrayConstructor } from '../types/common.js';

export type Single = true;
export type Multiple = false;
export type IndexType<T extends boolean> = T extends Single
  ? number
  : Int32Array;
export type ValueReturnType<U, T extends boolean> = T extends Single
  ? U
  : LazyArray<U>;

export const ALL_KEYS = Symbol('ALL_KEYS');
export const ALL_VALUES = Symbol('ALL_VALUES');
export const NULL_VALUE = Symbol('NULL_VALUE');

export type Key = string | number | symbol | string[] | number[];

type ValueCallStack<Reader> = [
  Reader,
  Record<string | number, any>,
  string | number
][];

const EMPTY_UINT8 = new Uint8Array(0);
const EMPTY_INT32 = new Int32Array(0);

export class Reader<T extends boolean = Single> {
  static dataView: DataView = new DataView(new Uint8Array(0).buffer);
  static schema: Schema = {};
  static linkedReaders: Record<string, any> = {};
  static indexSize = 4;
  static lengthSize = 4;

  typeName: string;
  currentOffset: number;
  currentType: Schema[string];
  currentIndex: IndexType<T>;
  currentLength: number;
  protected _isNestedRef?: boolean;

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
    if (this.currentOffset < 0) return true;
    return typeof atIndex === 'number'
      ? atIndex < 0 || atIndex >= this.currentLength
      : atIndex.length === 0;
  }

  isBranched(): this is BranchedReader<T> {
    return false;
  }

  value<U = any>(): ValueReturnType<U, T> | undefined {
    const _currentIndex = this.currentIndex as Int32Array;
    if (this.isPrimitive()) {
      return this.singleValue()
        ? this._primitiveValueAt(this.currentIndex)
        : new LazyArray<U>(
            i => this._primitiveValueAt(_currentIndex[i]),
            _currentIndex.length
          );
    }
    const refCache = createRefCache();
    return (
      this.singleValue()
        ? this._compoundValueAt(this.currentIndex, refCache)
        : new LazyArray<U>(
            i => this._compoundValueAt(_currentIndex[i], refCache),
            _currentIndex.length
          )
    ) as ValueReturnType<U, T>;
  }

  private _primitiveValueAt(atIndex: number) {
    if (atIndex == null || this.isUndefined(atIndex)) return undefined;
    const {
      currentType,
      currentOffset,
      context: { dataView, indexSize }
    } = this;
    const { size: _size, decode } = currentType as SchemaPrimitiveType;
    const size = typeof _size === 'number' ? _size : indexSize;
    return decode(dataView, currentOffset + atIndex * size);
  }

  private _compoundValueAt<U = any>(
    atIndex: number,
    refCache = createRefCache()
  ): U {
    if (atIndex == null || this.isUndefined(atIndex)) return undefined as U;
    const root: U[] = [];
    const currentStack: ValueCallStack<Reader<boolean>> = [];
    if (atIndex === this.currentIndex) {
      currentStack.push([this, root, 0]);
    } else {
      const { typeName, currentOffset, currentLength } = this;
      currentStack.push([
        this._nextReader(typeName, currentOffset, atIndex, currentLength),
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

    if (this.isBranched()) {
      parent[key] = this.value();
      return;
    }

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

    const {
      currentType,
      currentOffset,
      currentIndex,
      currentLength,
      context: { dataView, indexSize }
    } = this;
    if (this.isTuple()) {
      if (typeof key !== 'number') {
        throw new UsageError('Tuple type can only be accessed by index');
      }
      const i = key;
      const { children } = currentType as SchemaCompoundType<'Tuple'>;
      if (i < 0 || i >= children.length) {
        throw new UsageError(`Index ${i} is out of bounds`);
      }
      const nextType = children[i];
      const nextOffset = this.isUndefined()
        ? -1
        : readVarint(dataView, currentOffset + i * indexSize, true);

      return this._nextReader(
        nextType,
        nextOffset,
        currentIndex,
        currentLength
      );
    } else if (this.isNamedTuple()) {
      if (typeof key !== 'string') {
        throw new UsageError('Named tuple type can only be accessed by key');
      }
      const { children, indexes } = currentType as SchemaNamedTupleType;
      if (!(key in indexes)) {
        throw new UsageError(`Undefined key ${key}`);
      }
      const i = indexes[key];
      const nextType = children[i];
      const nextOffset = this.isUndefined()
        ? -1
        : readVarint(dataView, currentOffset + i * indexSize, true);

      return this._nextReader(
        nextType,
        nextOffset,
        currentIndex,
        currentLength
      );
    } else if (this.isArray()) {
      if (this.singleValue()) {
        return this._arrayReaderGet(this.currentIndex, key);
      } else {
        return new NestedReader(
          new LazyArray(
            i => this._arrayReaderGet(i, key),
            currentIndex as Int32Array
          ),
          this._arrayReaderGet(ALL_VALUES, key)
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
          this._mapReaderGet(ALL_VALUES, key)
        ) as Reader<boolean>;
      }
    } else if (this.isOptional()) {
      const {
        children: [nextType]
      } = currentType as SchemaCompoundType<'Optional'>;

      if (this.isUndefined()) {
        return this._nextReader(nextType, -1, currentIndex, currentLength);
      }

      const bitmask = decodeBitmask(
        DataTape.read(dataView, currentOffset),
        currentLength
      );
      const nextOffset = readVarint(dataView, currentOffset + indexSize, true);
      const nextIndex = this.singleValue()
        ? forwardMapSingleIndex(this.currentIndex, bitmask)
        : chainForwardIndexes(
            currentIndex as Int32Array,
            Int32Array.from(forwardMapIndexes(bitmask))
          );

      return this._nextReader(nextType, nextOffset, nextIndex, currentLength);
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

  private _arrayReaderGet(
    atIndex: number | typeof ALL_VALUES,
    i: Key
  ): Reader<boolean> {
    const {
      currentType,
      currentOffset,
      context: { dataView, indexSize, lengthSize }
    } = this;
    const {
      children: [nextType]
    } = currentType as SchemaCompoundType<'Array'>;

    const nextIndex = this._validateArrayKey(i);

    if (atIndex === ALL_VALUES || this._isNestedRef) {
      return this._nextReader(
        nextType,
        -1,
        typeof nextIndex === 'number' ? -1 : EMPTY_INT32,
        0
      );
    }
    if (this.isUndefined(atIndex)) return this._nextReader(nextType, -1, -1, 0);

    const offset = currentOffset + atIndex * (indexSize + lengthSize);
    const nextOffset = readVarint(dataView, offset, true);
    const nextLength = readVarint(dataView, offset + indexSize);
    return this._nextReader(
      nextType,
      nextOffset,
      nextIndex ?? getDefaultIndexMap(nextLength),
      nextLength
    );
  }

  private _validateArrayKey(i: Key): IndexType<boolean> | undefined {
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

  private _mapReaderGet(
    atIndex: number | typeof ALL_VALUES,
    k: Key
  ): Reader<boolean> {
    const {
      currentType,
      currentOffset,
      context: { dataView, indexSize, lengthSize }
    } = this;
    const {
      children: [nextType]
    } = currentType as SchemaCompoundType<'Array'>;

    const [nextIsSingle, getNextIndex] = this._validateMapKey(k);

    if (atIndex === ALL_VALUES || this._isNestedRef) {
      return this._nextReader(nextType, -1, nextIsSingle ? -1 : EMPTY_INT32, 0);
    }
    if (this.isUndefined(atIndex)) return this._nextReader(nextType, -1, -1, 0);

    const offset = currentOffset + atIndex * (2 * indexSize + lengthSize);
    const offsetToKeys = readVarint(dataView, offset, true);
    const offsetToValues = readVarint(dataView, offset + indexSize, true);
    const nextLength = readVarint(dataView, offset + 2 * indexSize);
    const getIndex = (k: string) => {
      for (let i = 0; i < nextLength; i++) {
        if (k === readString(dataView, offsetToKeys + i * indexSize)) return i;
      }
      return -1;
    };

    return this._nextReader(
      k === ALL_KEYS ? 'String' : nextType,
      k === ALL_KEYS ? offsetToKeys : offsetToValues,
      getNextIndex(getIndex) ?? getDefaultIndexMap(nextLength),
      nextLength
    );
  }

  private _validateMapKey(
    k: Key
  ): [
    boolean,
    (getIndex: (k: string) => number) => IndexType<boolean> | undefined
  ] {
    if (typeof k === 'string') return [true, getIndex => getIndex(k)];
    if (Array.isArray(k)) {
      for (const v of k) {
        if (typeof v !== 'string') {
          throw new UsageError(
            'Key must be a string, a set of strings, ALL_VALUES or ALL_KEYS'
          );
        }
      }
      return [false, getIndex => new Int32Array((k as string[]).map(getIndex))];
    }
    if (k !== ALL_VALUES && k !== ALL_KEYS) {
      throw new UsageError(
        `Key must be a string, a set of strings or ALL_VALUES or ALL_KEYS`
      );
    }
    return [false, () => undefined];
  }

  private _refReaderGet(atIndex: number): Reader<boolean> {
    const {
      currentType,
      currentOffset,
      context: { dataView, indexSize, lengthSize }
    } = this;
    const {
      children: [nextType]
    } = currentType as SchemaCompoundType<'Ref'>;

    if (this.isUndefined(atIndex)) return this._nextReader(nextType, -1, -1, 0);

    const offset = currentOffset + atIndex * (indexSize + lengthSize);
    const nextOffset = readVarint(dataView, offset, true);
    const nextIndex = readVarint(dataView, offset + indexSize);
    return this._nextReader(nextType, nextOffset, nextIndex, nextIndex + 1);
  }

  private _linkReaderGet(atIndex: number): Reader<boolean> {
    const NextReader = this.constructor as typeof Reader;
    const {
      currentType,
      currentOffset,
      context: { dataView }
    } = this;
    const { children } = currentType as SchemaCompoundType<'Link'>;
    const [schemaKey, nextType] = children[0].split('/');
    const isUndefined = this.isUndefined(atIndex);
    const offset = currentOffset + atIndex * 8;
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

  get apply() {
    if (this.singleValue()) {
      throw new UsageError('Calling apply on a single value reader');
    }
    return new ReaderApply(this as Reader<Multiple>);
  }

  dump(TypedArray: TypedArrayConstructor = Uint8Array) {
    if (!this.isPrimitive()) {
      throw new UsageError('Calling dump on a non-primitive type');
    }
    if (typeof (this.currentType as SchemaPrimitiveType).size !== 'number') {
      throw new UsageError('Calling dump on a variable size primitive type');
    }
    const [offset, length] = this._computeDump();
    return length > 0
      ? new TypedArray(
          this.context.dataView.buffer,
          offset,
          length / TypedArray.BYTES_PER_ELEMENT
        )
      : new TypedArray(0);
  }

  valueLength() {
    if (typeof this.currentIndex === 'number') return -1;
    return this.currentIndex.length;
  }

  protected _computeDump() {
    const { currentOffset, currentType, currentIndex, currentLength } = this;
    const { size: _size } = currentType as SchemaPrimitiveType;
    const size = _size as number;

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
      } else if (index > lastIndex + 1) {
        throw new UsageError('Calling dump on non-contiguous block');
      }
      length += size;
      lastIndex = index;
    }
    return [offset, length];
  }

  protected _nextReader(
    ...args: ConstructorParameters<typeof Reader<boolean>>
  ) {
    const nextReader = new (this.constructor as typeof Reader<boolean>)(
      ...args
    );
    nextReader._isNestedRef = this._isNestedRef;
    return nextReader;
  }

  protected get context() {
    return this.constructor as typeof Reader;
  }

  static addLink(schema: string, LinkedReader: typeof Reader) {
    this.linkedReaders[schema] = LinkedReader;
  }
}

export class NestedReader extends Reader<Multiple> {
  readers: LazyArray<Reader<boolean>>;
  ref: Reader<boolean>;

  constructor(readers: LazyArray<Reader<boolean>>, ref: Reader<boolean>) {
    super(ref.typeName, ref.currentOffset, ref.currentIndex, ref.currentLength);
    this.currentType = ref.currentType;
    this.readers = readers;
    // @ts-ignore
    ref._isNestedRef = true;
    this.ref = ref;
  }

  singleValue() {
    return false;
  }

  isUndefined(atIndex?: number | Int32Array) {
    if (typeof atIndex !== 'number') return false;
    return this.readers.get(atIndex).isUndefined();
  }

  isBranched() {
    return this.ref.isBranched();
  }

  switchBranch(branchIndex: number) {
    if (!this.isBranched()) return this;
    const nextReaders = this.readers.map(reader =>
      (reader as BranchedReader<boolean>).switchBranch(branchIndex)
    );
    const nextRef = (this.ref as BranchedReader<boolean>).switchBranch(
      branchIndex
    );
    return new NestedReader(nextReaders, nextRef);
  }

  value() {
    return this.readers.map(reader => reader && reader.value());
  }

  get(key: Key): NestedReader {
    const nextReaders = this.readers.map(reader => reader.get(key));
    const nextRef = this.ref.get(key);
    return new NestedReader(nextReaders, nextRef);
  }

  valueLength () {
    return this.readers.length;
  }

  _computeDump() {
    let offset = -1;
    let length = 0;
    for (const reader of LazyArray.iterateNested(this.readers).values) {
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

  get context(): typeof Reader {
    return (this.ref as NestedReader).context;
  }
}

export class BranchedReader<T extends boolean> extends Reader<T> {
  branches: Reader<T>[];
  currentBranch: number;
  discriminator: T extends Single ? number : Uint8Array;
  rootIndex: IndexType<T>;

  static from<T extends boolean>(root: Reader<T>) {
    if (!root.isOneOf()) {
      throw new InternalError(`Expects OneOf type`);
    }

    const _root = root as BranchedReader<T>;
    const {
      currentOffset,
      currentType,
      currentIndex,
      currentLength,
      context: { dataView, indexSize }
    } = _root;
    const { children } = currentType as SchemaCompoundType<'OneOf'>;

    if (root.isUndefined()) {
      const branches = children.map(nextType =>
        _root._nextReader(nextType, -1, currentIndex, currentLength)
      );
      return new BranchedReader(branches, 0, EMPTY_UINT8, currentIndex);
    }

    const oneOfIndex = decodeOneOf(
      DataTape.read(dataView, currentOffset),
      currentLength,
      children.length
    );

    if (root.singleValue()) {
      const _currentIndex = currentIndex as number;

      const [discriminator, branchNextIndex] = forwardMapSingleOneOf(
        _currentIndex,
        oneOfIndex,
        children.length
      );

      const branches = children.map((nextType, i) => {
        const offset = currentOffset + indexSize *  (i + 1);
        const nextOffset = readVarint(dataView, offset, true);
        return _root._nextReader(
          nextType,
          nextOffset,
          i === discriminator ? branchNextIndex : -1,
          currentLength
        );
      });

      return new BranchedReader(branches, 0, discriminator, _currentIndex);
    } else {
      const _currentIndex = currentIndex as Int32Array;

      const discriminator = Uint8Array.from(
        indexToOneOf(oneOfIndex, children.length)
      );
      const forwardMaps = forwardMapOneOf(oneOfIndex, children.length);

      const branches = children.map((nextType, i) => {
        const nextIndex = Int32Array.from(forwardMaps[i]);
        const offset = currentOffset + indexSize *  (i + 1);
        const nextOffset = readVarint(dataView, offset, true);
        return _root._nextReader(
          nextType,
          nextOffset,
          nextIndex,
          currentLength
        );
      });

      return new BranchedReader(branches, 0, discriminator, _currentIndex);
    }
  }

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

  singleValue() {
    if (typeof this.rootIndex !== 'number') return false;
    return this.branches[this.discriminator as number].singleValue();
  }

  isUndefined(atIndex: number | Int32Array = this.rootIndex) {
    return super.isUndefined(atIndex);
  }

  isBranched() {
    return true;
  }

  switchBranch(branchIndex: number) {
    return new BranchedReader(
      this.branches,
      branchIndex,
      this.discriminator,
      this.rootIndex
    );
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
    const { branches, currentBranch, discriminator, rootIndex } = this;
    const nextBranches = [...branches];
    nextBranches[currentBranch] = next;
    return new BranchedReader(
      nextBranches,
      currentBranch,
      discriminator,
      rootIndex
    );
  }

  valueLength(): number {
    if (typeof this.rootIndex === 'number') return -1;
    return this.rootIndex.length 
  }

  get context() {
    const branch = this.branches[this.currentBranch];
    return branch.constructor as typeof Reader;
  }
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

function chainForwardIndexes(a: Int32Array, b: Int32Array) {
  return a.map(i => (i < 0 ? -1 : b[i]));
}

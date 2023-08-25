import { NestedReader, BranchedReader } from './Readers.js';
import { LazyArray } from './LazyArray.js';

import { UsageError } from '../helpers/error.js';

import type { Reader, Multiple } from './Readers.js';

type ReaderApplyWhere = (reader: Reader<Multiple>) => Reader<Multiple>;

export class ReaderApply<T extends Reader<Multiple> = Reader<Multiple>> {
  target: T;

  constructor(target: T) {
    this.target = target;
  }

  get forEach() {
    if (!(this.target instanceof NestedReader)) {
      throw new UsageError('Calling apply.forEach on a non-nested reader');
    }
    return new ReaderApplyForEach(this.target);
  }

  reverse() {
    if (this.target instanceof NestedReader) {
      const nextReaders = this.target.readers.reverse();
      return new NestedReader(nextReaders, this.target.ref);
    }
    const currentIndex = (
      this.target instanceof BranchedReader
        ? this.target.rootIndex
        : this.target.currentIndex
    ) as Int32Array;
    const n = currentIndex.length;
    const nextIndex = new Int32Array(n);
    currentIndex.forEach((v, i) => {
      nextIndex[n - 1 - i] = v;
    });

    if (this.target instanceof BranchedReader) {
      const { branches, currentBranch, discriminator } = this.target;
      return new BranchedReader(
        branches,
        currentBranch,
        discriminator,
        nextIndex
      );
    }

    const { typeName, currentOffset, currentLength } = this.target;
    // @ts-ignore
    return this.target._nextReader(
      typeName,
      currentOffset,
      nextIndex,
      currentLength
    );
  }

  slice(start?: number, end?: number) {
    if (this.target instanceof NestedReader) {
      const nextReaders = this.target.readers.slice(start, end);
      return new NestedReader(nextReaders, this.target.ref);
    }

    const currentIndex = (
      this.target instanceof BranchedReader
        ? this.target.rootIndex
        : this.target.currentIndex
    ) as Int32Array;
    const nextIndex = currentIndex.slice(start, end);

    if (this.target instanceof BranchedReader) {
      const { branches, currentBranch, discriminator } = this.target;
      return new BranchedReader(
        branches,
        currentBranch,
        discriminator,
        nextIndex
      );
    }

    const { typeName, currentOffset, currentLength } = this.target;
    // @ts-ignore
    return this.target._nextReader(
      typeName,
      currentOffset,
      nextIndex,
      currentLength
    );
  }

  filter<V>(fn: (v: V, i: number) => any) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const value = where(this.target).value<V>();
        if (value == null) return this.target;
        const filtered = value.filter(fn);
        return this._reindex(filtered.indexMap);
      }
    };
  }

  sort<V>(fn: (a: V, b: V) => number) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const value = where(this.target).value<V>();
        if (value == null) return this.target;
        const sorted = value.sort(fn);
        return this._reindex(sorted.indexMap);
      }
    };
  }

  findAll<V>(target: LazyArray<V>, matchFn: (a: V, b: V) => boolean) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const value = where(this.target).value<V>();
        if (value == null) return this.target;
        const matched = value.findAll(target, matchFn);
        return this._reindex(matched.indexMap);
      }
    };
  }

  dropNull() {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        if (this.target instanceof NestedReader) {
          const nextReaders = this.target.readers.filter(
            reader => !where(reader).isUndefined()
          );
          return new NestedReader(nextReaders, this.target.ref);
        }

        const currentIndex = (
          this.target instanceof BranchedReader
            ? this.target.rootIndex
            : this.target.currentIndex
        ) as Int32Array;
        const whereReader = where(this.target);
        const whereIndex = (
          whereReader instanceof BranchedReader
            ? whereReader.rootIndex
            : whereReader.currentIndex
        ) as Int32Array;
        const nextIndex = currentIndex.filter((_, i) => whereIndex[i] >= 0);

        if (this.target instanceof BranchedReader) {
          const { branches, currentBranch, discriminator } = this.target;
          return new BranchedReader(
            branches,
            currentBranch,
            discriminator,
            nextIndex
          );
        }

        const { typeName, currentOffset, currentLength } = this.target;
        // @ts-ignore
        return this.target._nextReader(
          typeName,
          currentOffset,
          nextIndex,
          currentLength
        );
      }
    };
  }

  private _reindex(indexMap: Int32Array): Reader<Multiple> {
    const currentIndex = (
      this.target instanceof NestedReader
        ? this.target.readers.indexMap
        : this.target instanceof BranchedReader
        ? this.target.rootIndex
        : this.target.currentIndex
    ) as Int32Array;
    const nextIndex = indexMap.map(i => currentIndex[i]);

    if (this.target instanceof NestedReader) {
      return new NestedReader(
        new LazyArray(this.target.readers._get, nextIndex),
        this.target.ref
      );
    }

    if (this.target instanceof BranchedReader) {
      const { branches, currentBranch, discriminator } = this.target;
      return new BranchedReader(
        branches,
        currentBranch,
        discriminator,
        nextIndex
      ) as Reader<Multiple>;
    }

    const { typeName, currentOffset, currentLength } = this.target;
    // @ts-ignore
    return this.target._nextReader(
      typeName,
      currentOffset,
      nextIndex,
      currentLength
    );
  }
}

type ReaderApplyForEachCheck = (reader: Reader<boolean>) => boolean;
type ReaderApplyForEachApply = (reader: Reader<boolean>) => ReaderApply;
type ReaderApplyForEachRef = (reader: Reader<boolean>) => NestedReader;

export class ReaderApplyForEach extends ReaderApply<NestedReader> {
  _apply: ReaderApplyForEachApply;
  _check: ReaderApplyForEachCheck;
  _ref: ReaderApplyForEachRef;

  constructor(
    target: NestedReader,
    _apply: ReaderApplyForEachApply = reader => reader.apply,
    _check: ReaderApplyForEachCheck = reader => !reader.singleValue(),
    _ref: ReaderApplyForEachRef = reader => reader as NestedReader
  ) {
    super(target);
    this._check = _check;
    this._apply = _apply;
    this._ref = _ref;
  }

  get forEach(): ReaderApplyForEach {
    if (!(this._ref(this.target).ref instanceof NestedReader)) {
      throw new UsageError('Maximum depth reached with apply.forEach');
    }
    return new ReaderApplyForEach(
      this.target,
      reader => this._apply(reader).forEach,
      reader =>
        this._check(reader) && this._ref(reader) instanceof NestedReader,
      reader => this._ref(reader).ref as NestedReader
    );
  }

  reverse() {
    const nextReaders: LazyArray<Reader<boolean>> = this.target.readers.map(
      reader => (this._check(reader) ? this._apply(reader).reverse() : reader)
    );
    return new NestedReader(nextReaders, this.target.ref);
  }

  slice(start?: number, end?: number) {
    const nextReaders: LazyArray<Reader<boolean>> = this.target.readers.map(
      reader =>
        this._check(reader) ? this._apply(reader).slice(start, end) : reader
    );
    return new NestedReader(nextReaders, this.target.ref);
  }

  filter<V>(fn: (v: V, i: number) => any) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const nextReaders: LazyArray<Reader<boolean>> = this.target.readers.map(
          reader =>
            this._check(reader)
              ? this._apply(reader).filter(fn).on(where)
              : reader
        );
        return new NestedReader(nextReaders, this.target.ref);
      }
    };
  }

  sort<V>(fn: (a: V, b: V) => number) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const nextReaders: LazyArray<Reader<boolean>> = this.target.readers.map(
          reader =>
            this._check(reader)
              ? this._apply(reader).sort(fn).on(where)
              : reader
        );
        return new NestedReader(nextReaders, this.target.ref);
      }
    };
  }

  findAll<V>(target: LazyArray<V>, matchFn: (a: V, b: V) => boolean) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const nextReaders: LazyArray<Reader<boolean>> = this.target.readers.map(
          reader =>
            this._check(reader)
              ? this._apply(reader).findAll(target, matchFn).on(where)
              : reader
        );
        return new NestedReader(nextReaders, this.target.ref);
      }
    };
  }

  dropNull() {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const nextReaders: LazyArray<Reader<boolean>> = this.target.readers.map(
          reader =>
            this._check(reader)
              ? this._apply(reader).dropNull().on(where)
              : reader
        );
        return new NestedReader(nextReaders, this.target.ref);
      }
    };
  }
}

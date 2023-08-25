import { NestedReader } from './Readers.js';
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
    const { typeName, currentOffset, currentIndex, currentLength } =
      this.target;
    const n = currentIndex.length;
    const nextIndex = new Int32Array(n);
    currentIndex.forEach((v, i) => {
      nextIndex[n - 1 - i] = v;
    });
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
    const { typeName, currentOffset, currentIndex, currentLength } =
      this.target;
    const nextIndex = currentIndex.slice(start, end);
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

        if (this.target instanceof NestedReader) {
          const { _get, indexMap } = this.target.readers;
          const nextIndexMap = filtered.indexMap.map(i => indexMap[i]);
          return new NestedReader(
            new LazyArray(_get, nextIndexMap),
            this.target.ref
          );
        }

        const { typeName, currentOffset, currentIndex, currentLength } =
          this.target;
        const nextIndex = filtered.indexMap.map(i => currentIndex[i]);
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

  sort<V>(fn: (a: V, b: V) => number) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const value = where(this.target).value<V>();
        if (value == null) return this.target;
        const sorted = value.sort(fn);

        if (this.target instanceof NestedReader) {
          const { _get, indexMap } = this.target.readers;
          const nextIndexMap = sorted.indexMap.map(i => indexMap[i]);
          return new NestedReader(
            new LazyArray(_get, nextIndexMap),
            this.target.ref
          );
        }

        const { typeName, currentOffset, currentIndex, currentLength } =
          this.target;
        const nextIndex = sorted.indexMap.map(i => currentIndex[i]);
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

  findAll<V>(target: LazyArray<V>, matchFn: (a: V, b: V) => boolean) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const value = where(this.target).value<V>();
        if (value == null) return this.target;
        const matched = value.findAll(target, matchFn);

        if (this.target instanceof NestedReader) {
          const { _get, indexMap } = this.target.readers;
          const nextIndexMap = matched.indexMap.map(i =>
            i < 0 ? -1 : indexMap[i]
          );
          return new NestedReader(
            new LazyArray(_get, nextIndexMap),
            this.target.ref
          );
        }

        const { typeName, currentOffset, currentIndex, currentLength } =
          this.target;
        const nextIndex = matched.indexMap.map(i => currentIndex[i]);
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

  dropNull() {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        if (this.target instanceof NestedReader) {
          const nextReaders = this.target.readers.filter(
            reader => !where(reader).isUndefined()
          );
          return new NestedReader(nextReaders, this.target.ref);
        }
        const reader = where(this.target);
        const { typeName, currentOffset, currentIndex, currentLength } =
          this.target;
        const nextIndex = currentIndex.filter(
          (_, i) => reader.currentIndex[i] >= 0
        );
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
}

type ReaderApplyForEachCheck = (reader: Reader<boolean>) => boolean;
type ReaderApplyForEachApply = (reader: Reader<boolean>) => ReaderApply;

export class ReaderApplyForEach extends ReaderApply<NestedReader> {
  _check: ReaderApplyForEachCheck;
  _apply: ReaderApplyForEachApply;

  constructor(
    target: NestedReader,
    _check: ReaderApplyForEachCheck = reader => !reader.singleValue(),
    _apply: ReaderApplyForEachApply = reader => reader.apply
  ) {
    super(target);
    this._check = _check;
    this._apply = _apply;
  }

  get forEach(): ReaderApplyForEach {
    return new ReaderApplyForEach(
      this.target,
      reader => reader instanceof NestedReader,
      reader => this._apply(reader).forEach
    );
  }

  reverse() {
    const nextReaders: LazyArray<Reader<boolean>> = this.target.readers.map(
      reader => this._check(reader) ? this._apply(reader).reverse() : reader
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

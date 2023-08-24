import { NestedReader } from './Readers.js';
import { LazyArray } from './LazyArray.js';

import type { Reader, Multiple } from './Readers.js';

type ReaderApplyWhere = (reader: Reader<Multiple>) => Reader<Multiple>;

export class ReaderApply {
  target: Reader<Multiple>;

  constructor(target: Reader<Multiple>) {
    this.target = target;
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

export class NestedReaderSplitApply {
  target: NestedReader;

  constructor(target: NestedReader) {
    this.target = target;
  }

  reverse() {
    const nextReaders = this.target.readers.map(reader => {
      return reader.singleValue()
        ? reader
        : (reader as Reader<Multiple>).apply().reverse();
    });
    return new NestedReader(nextReaders, this.target.ref);
  }

  slice(start?: number, end?: number) {
    const nextReaders = this.target.readers.map(reader => {
      return reader.singleValue()
        ? reader
        : (reader as Reader<Multiple>).apply().slice(start, end);
    });
    return new NestedReader(nextReaders, this.target.ref);
  }

  filter<V>(fn: (v: V, i: number) => any) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const nextReaders = this.target.readers.map(reader => {
          return reader.singleValue()
            ? reader
            : (reader as Reader<Multiple>).apply().filter(fn).on(where);
        });
        return new NestedReader(nextReaders, this.target.ref);
      }
    };
  }

  sort<V>(fn: (a: V, b: V) => number) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const nextReaders = this.target.readers.map(reader => {
          return reader.singleValue()
            ? reader
            : (reader as Reader<Multiple>).apply().sort(fn).on(where);
        });
        return new NestedReader(nextReaders, this.target.ref);
      }
    };
  }

  findAll<V>(target: LazyArray<V>, matchFn: (a: V, b: V) => boolean) {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const nextReaders = this.target.readers.map(reader => {
          return reader.singleValue()
            ? reader
            : (reader as Reader<Multiple>)
                .apply()
                .findAll(target, matchFn)
                .on(where);
        });
        return new NestedReader(nextReaders, this.target.ref);
      }
    };
  }

  dropNull() {
    return {
      on: (where: ReaderApplyWhere = reader => reader) => {
        const nextReaders = this.target.readers.map(reader => {
          return reader.singleValue()
            ? reader
            : (reader as Reader<Multiple>).apply().dropNull().on(where);
        });
        return new NestedReader(nextReaders, this.target.ref);
      }
    };
  }
}
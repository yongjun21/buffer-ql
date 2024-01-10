import {
  encodeBitmask,
  encodeOneOf,
  bitToIndex,
  oneOfToIndex,
  backwardMapIndexes,
  backwardMapOneOf
} from '../helpers/bitmask.js';
import { sizeVarint, writeVarint, DataTape } from '../helpers/io.js';

import { ValueError } from '../helpers/error.js';

import type {
  Schema,
  SchemaPrimitiveType,
  SchemaCompoundType,
  SchemaNamedTupleType
} from '../schema/index.js';

interface Allocation {
  indexSize: number;
  lengthSize: number;
  unitSize: number;
  maxLength: number;
}

export function createEncoder(schema: Schema) {
  class Writer {
    typeName: string;
    currentType: Schema[string];
    currentSource: any[];
    currentOffset = -1;
    bitmask?: Iterable<number>;
    branches: any[] = [];
    allocated = {
      indexSize: 0,
      lengthSize: 0,
      unitSize: 0
    };

    constructor(type: string, source: any[]) {
      this.typeName = type;
      this.currentType = schema[type];
      this.currentSource = source;

      if (this.currentType.ref && !(this instanceof WriterGroup)) {
        source.forEach((value, i) => references.set(value, [this, i]));
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

    isNull() {
      return this.currentSource.length === 0;
    }

    spawn() {
      if (
        this.isPrimitive() ||
        this.isRef() ||
        this.isLink() ||
        this.isNull()
      ) {
        return [];
      }

      const { currentType, currentSource: _currentSource } = this;
      const nextBranches: Writer[] = [];

      const { transform } = currentType;
      const currentSource = transform
        ? _currentSource.map(transform)
        : _currentSource;

      if (this.isTuple()) {
        const { children } = currentType as SchemaCompoundType<'Tuple'>;
        children.forEach((nextType, i) => {
          const nextSource = currentSource.map(value => value[i]);
          nextBranches.push(new Writer(nextType, nextSource));
        });
      } else if (this.isNamedTuple()) {
        const { children, keys } = currentType as SchemaNamedTupleType;
        children.forEach((nextType, i) => {
          const k = keys[i];
          const nextSource = currentSource.map(value => value[k]);
          nextBranches.push(new Writer(nextType, nextSource));
        });
      } else if (this.isArray()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Array'>;
        const writers = currentSource.map(
          (nextSource: any[]) => new Writer(nextType, nextSource)
        );
        nextBranches.push(
          writers.length > 1 ? new WriterGroup(writers) : writers[0]
        );
      } else if (this.isMap()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Map'>;
        const keyWriters = currentSource.map((value: Record<string, any>) => {
          return new Writer('String', Object.keys(value));
        });
        const valWriters = currentSource.map((value: Record<string, any>) => {
          return new Writer(nextType, Object.values(value));
        });
        nextBranches.push(
          keyWriters.length > 1 ? new WriterGroup(keyWriters) : keyWriters[0],
          valWriters.length > 1 ? new WriterGroup(valWriters) : valWriters[0]
        );
      } else if (this.isOptional()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Optional'>;

        const discriminator = currentSource.map(value =>
          value == null ? 0 : 1
        );

        const bitmask = bitToIndex(discriminator);
        this.bitmask = bitmask;

        const nextSource: any[] = [];
        for (const i of backwardMapIndexes(bitmask)) {
          nextSource.push(currentSource[i]);
        }
        nextBranches.push(new Writer(nextType, nextSource));
      } else if (this.isOneOf()) {
        const { children } = currentType as SchemaCompoundType<'OneOf'>;

        const discriminator = currentSource.map(value => {
          for (let k = 0; k < children.length; k++) {
            const nextType = schema[children[k]];
            const checker = nextType.check || (() => true);
            if (checker(value)) return k;
          }
          throw new ValueError(
            `Value ${value} does not match any of the OneOf types`
          );
        });

        const oneOfIndex = oneOfToIndex(discriminator, children.length);
        this.bitmask = oneOfIndex;

        const backwardIndexes = backwardMapOneOf(oneOfIndex, children.length);
        backwardIndexes.forEach((indexes, k) => {
          const nextType = children[k];
          const nextSource: any[] = [];
          for (const i of indexes) nextSource.push(currentSource[i]);
          nextBranches.push(new Writer(nextType, nextSource));
        });
      }

      this.branches = nextBranches;
      return nextBranches;
    }

    allocate(alloc: Allocation, db: DataTape) {
      if (this.isNull()) return;

      const { currentType, currentSource, bitmask, allocated } = this;

      allocated.indexSize = alloc.indexSize;
      allocated.lengthSize = alloc.lengthSize;
      allocated.unitSize = alloc.unitSize;
      alloc.maxLength = Math.max(alloc.maxLength, currentSource.length);

      if (this.isPrimitive()) {
        const { size } = currentType as SchemaPrimitiveType;
        if (typeof size === 'function') {
          currentSource.forEach(value => size(value, db));
          alloc.indexSize += currentSource.length;
        } else {
          alloc.unitSize += size * currentSource.length;
        }
      } else if (this.isTuple() || this.isNamedTuple()) {
        const { children } = currentType as SchemaCompoundType<'Tuple'>;
        alloc.indexSize += children.length;
      } else if (this.isArray()) {
        alloc.indexSize += currentSource.length;
        alloc.lengthSize += currentSource.length;
      } else if (this.isMap()) {
        alloc.indexSize += 2 * currentSource.length;
        alloc.lengthSize += currentSource.length;
      } else if (this.isRef()) {
        alloc.indexSize += currentSource.length;
        alloc.lengthSize += currentSource.length;
      } else if (this.isLink()) {
        alloc.unitSize += 8 * currentSource.length;
      } else if (this.isOptional()) {
        db.put(encodeBitmask(bitmask!, currentSource.length), bitmask!);
        alloc.indexSize += 2;
      } else if (this.isOneOf()) {
        const { children } = currentType as SchemaCompoundType<'OneOf'>;
        db.put(
          encodeOneOf(bitmask!, currentSource.length, children.length),
          bitmask!
        );
        alloc.indexSize += children.length + 1;
      } else {
        throw new TypeError(
          `Allocation not implemented for ${currentType.type}`
        );
      }
    }

    position(n: number, m: number, adj: number) {
      const { indexSize, lengthSize, unitSize } = this.allocated;
      this.currentOffset = indexSize * n + lengthSize * m + unitSize + adj;
    }

    write(
      dataView: DataView,
      db: DataTape,
      indexSize: number,
      lengthSize: number
    ) {
      if (this.isNull()) return;
      const { currentOffset, currentType, currentSource, branches, bitmask } =
        this;

      if (this.isPrimitive()) {
        const { size: _size, encode } = currentType as SchemaPrimitiveType;
        const size = typeof _size === 'number' ? _size : indexSize;
        currentSource.forEach((value, i) => {
          const offset = currentOffset + i * size;
          encode(dataView, offset, value, db);
        });
      } else if (this.isTuple() || this.isNamedTuple()) {
        branches.forEach((branch, i) => {
          const offset = currentOffset + i * indexSize;
          writeVarint(dataView, offset, branch.currentOffset, true);
        });
      } else if (this.isArray()) {
        const [valWriterGroup] = branches as [Writer];
        if (valWriterGroup instanceof WriterGroup) {
          valWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * (indexSize + lengthSize);
            writeVarint(dataView, offset, child.currentOffset, true);
            writeVarint(
              dataView,
              offset + indexSize,
              child.currentSource.length
            );
          });
        } else {
          const offset = currentOffset;
          const child = valWriterGroup;
          writeVarint(dataView, offset, child.currentOffset, true);
          writeVarint(dataView, offset + indexSize, child.currentSource.length);
        }
      } else if (this.isMap()) {
        const [keyWriterGroup, valWriterGroup] = branches as [Writer, Writer];
        if (keyWriterGroup instanceof WriterGroup) {
          keyWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * (2 * indexSize + lengthSize);
            writeVarint(dataView, offset, child.currentOffset, true);
          });
        } else {
          const offset = currentOffset;
          const child = keyWriterGroup;
          writeVarint(dataView, offset, child.currentOffset, true);
        }
        if (valWriterGroup instanceof WriterGroup) {
          valWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * (2 * indexSize + lengthSize);
            writeVarint(
              dataView,
              offset + indexSize,
              child.currentOffset,
              true
            );
            writeVarint(
              dataView,
              offset + 2 * indexSize,
              child.currentSource.length
            );
          });
        } else {
          const offset = currentOffset;
          const child = valWriterGroup;
          writeVarint(dataView, offset + indexSize, child.currentOffset, true);
          writeVarint(
            dataView,
            offset + 2 * indexSize,
            child.currentSource.length
          );
        }
      } else if (this.isOptional()) {
        const [valWriter] = branches as [Writer];
        DataTape.write(dataView, currentOffset, bitmask!, db);
        writeVarint(
          dataView,
          currentOffset + indexSize,
          valWriter.currentOffset,
          true
        );
      } else if (this.isOneOf()) {
        DataTape.write(dataView, currentOffset, bitmask!, db);
        (branches as Writer[]).forEach((valWriter, i) => {
          const offset = currentOffset + indexSize * (i + 1);
          writeVarint(dataView, offset, valWriter.currentOffset, true);
        });
      } else if (this.isRef()) {
        currentSource.forEach((value, i) => {
          const ref = references.get(value);
          if (!ref) {
            throw new ValueError('Reference object outside of scope');
          }
          const [writer, index] = ref;
          const offset = currentOffset + i * (indexSize + lengthSize);
          writeVarint(dataView, offset, writer.currentOffset, true);
          writeVarint(dataView, offset + indexSize, index);
        });
      } else if (this.isLink()) {
        currentSource.forEach((_, i) => {
          const offset = currentOffset + i * 8;
          dataView.setInt32(offset, -1, true);
          dataView.setInt32(offset + 4, -1, true);
        });
      }
    }
  }

  class WriterGroup extends Writer {
    writers: Writer[];

    constructor(writers: Writer[]) {
      const ref = writers[0];
      super(ref.typeName, ref.currentSource);
      this.writers = writers;
      this.allocated = ref.allocated;
    }

    spawn() {
      const _nextBranches: Writer[][] = [];
      for (const writer of this.writers) {
        const children = writer.spawn();
        if (children.length === 0) {
          continue;
        }
        for (let i = 0; i < children.length; i++) {
          _nextBranches[i] = _nextBranches[i] || [];
          _nextBranches[i].push(children[i]);
        }
      }
      const nextBranches: Writer[] = _nextBranches.map(writers =>
        writers.length > 1 ? new WriterGroup(writers) : writers[0]
      );
      this.branches = nextBranches;
      return nextBranches;
    }

    allocate(alloc: Allocation, db: DataTape) {
      for (const writer of this.writers) {
        writer.allocate(alloc, db);
      }
    }

    position(n: number, m: number, adj: number): void {
      for (const writer of this.writers) {
        writer.position(n, m, adj);
      }
    }

    write(
      dataView: DataView,
      db: DataTape,
      indexSize: number,
      lengthSize: number
    ) {
      for (const writer of this.writers) {
        writer.write(dataView, db, indexSize, lengthSize);
      }
    }
  }

  const references = new Map<any, [Writer, number]>();

  return function encode(data: any, rootType: string) {
    references.clear();
    const groupedWriters: Record<string, Writer[]> = {};
    const stack: Writer[] = [];
    const root = new Writer(rootType, [data]);
    stack.push(root);

    while (stack.length > 0) {
      const writer = stack.pop()!;
      const { typeName } = writer;
      groupedWriters[typeName] = groupedWriters[typeName] ?? [];
      groupedWriters[typeName].push(writer);
      const children = writer.spawn();
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }

    const sortedWriters = Object.values(groupedWriters).sort((a, b) => {
      const aWriter = a[0];
      const bWriter = b[0];
      const aType = aWriter.currentType as SchemaPrimitiveType;
      const bType = bWriter.currentType as SchemaPrimitiveType;
      const aSize = typeof aType.size === 'number' ? aType.size : 0;
      const bSize = typeof bType.size === 'number' ? bType.size : 0;
      return aSize - bSize;
    });

    const alloc: Allocation = {
      indexSize: 0,
      lengthSize: 0,
      unitSize: 1,
      maxLength: 0
    };
    const db = new DataTape();

    for (const writers of sortedWriters) {
      for (const writer of writers) {
        writer.allocate(alloc, db);
      }
    }

    const paddings = new Set<number>();
    for (const writers of sortedWriters) {
      const writerType = writers[0].currentType as SchemaPrimitiveType;
      if (typeof writerType.size === 'number') {
        paddings.add(writerType.size - 1);
      }
    }

    const exportedDb = db.export();
    const [n, m] = optimizeAlloc(alloc, paddings, exportedDb.length);

    let sumPadding = 0;
    for (const writers of sortedWriters) {
      const writerType = writers[0].currentType as SchemaPrimitiveType;
      if (typeof writerType.size === 'number') {
        const { indexSize, lengthSize, unitSize } = writers[0].allocated;
        const offset = indexSize * n + lengthSize * m + unitSize + sumPadding;
        if (offset % writerType.size !== 0) {
          sumPadding += writerType.size - (offset % writerType.size);
        }
      }
      for (const writer of writers) {
        writer.position(n, m, sumPadding);
      }
    }

    const offset =
      alloc.indexSize * n + alloc.lengthSize * m + alloc.unitSize + sumPadding;
    const buffer = new ArrayBuffer(offset + exportedDb.length);
    db.shift(offset);

    const dv = new DataView(buffer);
    dv.setUint8(0, (n << 4) | m);
    for (const writers of sortedWriters) {
      for (const writer of writers) {
        writer.write(dv, db, n, m);
      }
    }

    const encoded = new Uint8Array(buffer);
    encoded.set(exportedDb, offset);
    return encoded;
  };
}

function optimizeAlloc(
  alloc: Allocation,
  paddings: Set<number>,
  additional: number
) {
  const m = sizeVarint(alloc.maxLength);
  const sumPadding = [...paddings].reduce((a, b) => a + b, 0);
  for (let n = 1; n <= 4; n++) {
    const totalSize =
      alloc.indexSize * n +
      alloc.lengthSize * m +
      alloc.unitSize +
      sumPadding +
      additional;
    if (sizeVarint(totalSize, true) <= n) return [n, m];
  }
  throw new Error('Index overflow, split data into smaller chunks');
}

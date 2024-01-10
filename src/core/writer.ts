import {
  encodeBitmask,
  encodeOneOf,
  bitToIndex,
  oneOfToIndex,
  backwardMapIndexes,
  backwardMapOneOf
} from '../helpers/bitmask.js';
import { writeVarint, DataTape } from '../helpers/io.js';

import { ValueError } from '../helpers/error.js';

import type {
  Schema,
  SchemaPrimitiveType,
  SchemaCompoundType,
  SchemaNamedTupleType
} from '../schema/index.js';

const MAX_INDEX = 2 ** 32 - 1;

export function createEncoder(schema: Schema) {
  class Writer {
    typeName: string;
    currentType: Schema[string];
    currentSource: any[];
    currentOffset = -1;
    bitmask?: Iterable<number>;
    branches: any[] = [];

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

    allocate(offset: number, db: DataTape) {
      if (this.isNull()) return offset;

      const { currentType, currentSource, bitmask } = this;

      if (this.isPrimitive()) {
        // align offset to multiples of size
        const { size } = currentType as SchemaPrimitiveType;
        if (typeof size === 'number') {
          offset = Math.ceil(offset / size) * size;
        }
      }

      this.currentOffset = offset;

      if (this.isPrimitive()) {
        const { size: _size } = currentType as SchemaPrimitiveType;
        const size = typeof _size === 'number' ? _size : 4;
        if (typeof _size === 'function') {
          currentSource.forEach(value => _size(value, db));
        }
        return offset + size * currentSource.length;
      }

      if (this.isArray()) return offset + 8 * currentSource.length;
      if (this.isMap()) return offset + 12 * currentSource.length;

      if (this.isRef() || this.isLink()) {
        return offset + 8 * currentSource.length;
      }

      if (this.isTuple() || this.isNamedTuple()) {
        const { children } = currentType as SchemaCompoundType<'Tuple'>;
        return offset + 4 * children.length;
      }

      if (this.isOptional()) {
        db.put(encodeBitmask(bitmask!, currentSource.length), bitmask!);
        return offset + 4 + 4;
      }

      if (this.isOneOf()) {
        const { children } = currentType as SchemaCompoundType<'OneOf'>;
        db.put(
          encodeOneOf(bitmask!, currentSource.length, children.length),
          bitmask!
        );
        return offset + 4 + 4 * children.length;
      }

      throw new TypeError(`Allocation not implemented for ${currentType.type}`);
    }

    write(dataView: DataView, db: DataTape) {
      if (this.isNull()) return;
      const { currentOffset, currentType, currentSource, branches, bitmask } =
        this;

      if (this.isPrimitive()) {
        const { size: _size, encode } = currentType as SchemaPrimitiveType;
        const size = typeof _size === 'number' ? _size : 4;
        currentSource.forEach((value, i) => {
          const offset = currentOffset + i * size;
          encode(dataView, offset, value, db);
        });
      } else if (this.isTuple() || this.isNamedTuple()) {
        branches.forEach((branch, i) => {
          const offset = currentOffset + i * 4;
          writeVarint(dataView, offset, branch.currentOffset, true);
        });
      } else if (this.isArray()) {
        const [valWriterGroup] = branches as [Writer];
        if (valWriterGroup instanceof WriterGroup) {
          valWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * 8;
            writeVarint(dataView, offset, child.currentOffset, true);
            writeVarint(dataView, offset + 4, child.currentSource.length);
          });
        } else {
          const offset = currentOffset;
          const child = valWriterGroup;
          writeVarint(dataView, offset, child.currentOffset, true);
          writeVarint(dataView, offset + 4, child.currentSource.length);
        }
      } else if (this.isMap()) {
        const [keyWriterGroup, valWriterGroup] = branches as [Writer, Writer];
        if (keyWriterGroup instanceof WriterGroup) {
          keyWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * 12;
            writeVarint(dataView, offset, child.currentOffset, true);
          });
        } else {
          const offset = currentOffset;
          const child = keyWriterGroup;
          writeVarint(dataView, offset, child.currentOffset, true);
        }
        if (valWriterGroup instanceof WriterGroup) {
          valWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * 12;
            writeVarint(dataView, offset + 4, child.currentOffset, true);
            writeVarint(dataView, offset + 8, child.currentSource.length);
          });
        } else {
          const offset = currentOffset;
          const child = valWriterGroup;
          writeVarint(dataView, offset + 4, child.currentOffset, true);
          writeVarint(dataView, offset + 8, child.currentSource.length);
        }
      } else if (this.isOptional()) {
        const [valWriter] = branches as [Writer];
        DataTape.write(dataView, currentOffset, bitmask!, db);
        writeVarint(dataView, currentOffset + 4, valWriter.currentOffset, true);
      } else if (this.isOneOf()) {
        DataTape.write(dataView, currentOffset, bitmask!, db);
        (branches as Writer[]).forEach((valWriter, i) => {
          const offset = currentOffset + 4 + i * 4;
          writeVarint(dataView, offset, valWriter.currentOffset, true);
        });
      } else if (this.isRef()) {
        currentSource.forEach((value, i) => {
          const ref = references.get(value);
          if (!ref) {
            throw new ValueError('Reference object outside of scope');
          }
          const [writer, index] = ref;
          const offset = currentOffset + i * 8;
          writeVarint(dataView, offset, writer.currentOffset, true);
          writeVarint(dataView, offset + 4, index, true);
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

    allocate(offset: number, db: DataTape) {
      for (const writer of this.writers) {
        offset = writer.allocate(offset, db);
      }
      return offset;
    }

    write(dataView: DataView, db: DataTape) {
      for (const writer of this.writers) {
        writer.write(dataView, db);
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

    let offset = 1;

    const db = new DataTape();

    const sortedWriters = Object.values(groupedWriters).sort((a, b) => {
      const aWriter = a[0];
      const bWriter = b[0];
      const aType = aWriter.currentType as SchemaPrimitiveType;
      const bType = bWriter.currentType as SchemaPrimitiveType;
      const aSize = typeof aType.size === 'number' ? aType.size : MAX_INDEX;
      const bSize = typeof bType.size === 'number' ? bType.size : MAX_INDEX;
      return bSize - aSize;
    });
    for (const writers of sortedWriters) {
      for (const writer of writers) {
        offset = writer.allocate(offset, db);
      }
    }

    const buffer = new ArrayBuffer(offset);
    const dv = new DataView(buffer);
    db.shift(offset);

    for (const writers of Object.values(groupedWriters)) {
      for (const writer of writers) {
        writer.write(dv, db);
      }
    }

    const exportedDb = db.export();

    const combined = new Uint8Array(buffer.byteLength + exportedDb.length);
    combined.set(new Uint8Array(buffer), 0);
    combined.set(exportedDb, buffer.byteLength);

    return combined;
  };
}

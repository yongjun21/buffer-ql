import {
  bitToIndex,
  oneOfToIndex,
  backwardMapIndexes,
  backwardMapOneOf
} from '../helpers/bitmask.js';
import { createStringWriter, createBitmaskWriter } from '../helpers/io.js';

import { ValueError } from '../helpers/error.js';

import type {
  Schema,
  SchemaPrimitiveType,
  SchemaCompoundType,
  SchemaNamedTupleType
} from '../schema/index.js';

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

    allocate(offset: number) {
      const { currentType, currentSource } = this;

      if (this.isPrimitive()) {
        // align offset to multiples of size
        const { size } = currentType as SchemaPrimitiveType;
        offset = Math.ceil(offset / size) * size;
      }

      this.currentOffset = offset;

      if (this.isNull()) return offset;

      if (this.isPrimitive()) {
        const { size } = currentType as SchemaPrimitiveType;
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

      if (this.isOptional()) return offset + 4 + 4;

      if (this.isOneOf()) {
        const { children } = currentType as SchemaCompoundType<'OneOf'>;
        return offset + 4 + 4 * children.length;
      }

      throw new TypeError(`Allocation not implemented for ${currentType.type}`);
    }

    write(dataView: DataView, ...args: any[]) {
      if (this.isNull()) return;
      const { currentOffset, currentType, currentSource, branches, bitmask } =
        this;

      if (this.isPrimitive()) {
        const { size, encode } = currentType as SchemaPrimitiveType;
        currentSource.forEach((value, i) => {
          const offset = currentOffset + i * size;
          encode(dataView, offset, value, ...args);
        });
      } else if (this.isTuple() || this.isNamedTuple()) {
        branches.forEach((branch, i) => {
          const offset = currentOffset + i * 4;
          dataView.setInt32(offset, branch.currentOffset, true);
        });
      } else if (this.isArray()) {
        const [valWriterGroup] = branches as [Writer];
        if (valWriterGroup instanceof WriterGroup) {
          valWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * 8;
            dataView.setInt32(offset, child.currentOffset, true);
            dataView.setInt32(offset + 4, child.currentSource.length, true);
          });
        } else {
          const offset = currentOffset;
          const child = valWriterGroup;
          dataView.setInt32(offset, child.currentOffset, true);
          dataView.setInt32(offset + 4, child.currentSource.length, true);
        }
      } else if (this.isMap()) {
        const [keyWriterGroup, valWriterGroup] = branches as [Writer, Writer];
        if (keyWriterGroup instanceof WriterGroup) {
          keyWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * 12;
            dataView.setInt32(offset, child.currentOffset, true);
          });
        } else {
          const offset = currentOffset;
          const child = keyWriterGroup;
          dataView.setInt32(offset, child.currentOffset, true);
        }
        if (valWriterGroup instanceof WriterGroup) {
          valWriterGroup.writers.forEach((child, i) => {
            const offset = currentOffset + i * 12;
            dataView.setInt32(offset + 4, child.currentOffset, true);
            dataView.setInt32(offset + 8, child.currentSource.length, true);
          });
        } else {
          const offset = currentOffset;
          const child = valWriterGroup;
          dataView.setInt32(offset + 4, child.currentOffset, true);
          dataView.setInt32(offset + 8, child.currentSource.length, true);
        }
      } else if (this.isOptional()) {
        const bitmaskWriter: ReturnType<typeof createBitmaskWriter> = args[0];
        const [valWriter] = branches as [Writer];
        const bitmaskOffset = bitmaskWriter.write(
          bitmask!,
          currentSource.length
        );
        dataView.setInt32(currentOffset, bitmaskOffset, true);
        dataView.setInt32(currentOffset + 4, valWriter.currentOffset, true);
      } else if (this.isOneOf()) {
        const bitmaskWriter: ReturnType<typeof createBitmaskWriter> = args[0];
        const bitmaskOffset = bitmaskWriter.write(
          bitmask!,
          currentSource.length,
          branches.length
        );
        dataView.setInt32(currentOffset, bitmaskOffset, true);
        (branches as Writer[]).forEach((valWriter, i) => {
          const offset = currentOffset + 4 + i * 4;
          dataView.setInt32(offset, valWriter.currentOffset, true);
        });
      } else if (this.isRef()) {
        currentSource.forEach((value, i) => {
          const ref = references.get(value);
          if (!ref) {
            throw new ValueError('Reference object outside of scope');
          }
          const [writer, index] = ref;
          const offset = currentOffset + i * 8;
          dataView.setInt32(offset, writer.currentOffset, true);
          dataView.setInt32(offset + 4, index, true);
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

    allocate(offset: number) {
      let _offset = offset;
      for (const writer of this.writers) {
        _offset = writer.allocate(_offset);
      }
      return _offset;
    }

    write(dataView: DataView, ...args: any[]) {
      for (const writer of this.writers) {
        writer.write(dataView, ...args);
      }
    }
  }

  const references = new Map<any, [Writer, number]>();

  return function encode(data: any, rootType: string) {
    const orderedWriters: Record<string, Writer[]> = {};
    const stack: Writer[] = [];
    const root = new Writer(rootType, [data]);
    stack.push(root);

    while (stack.length > 0) {
      const writer = stack.pop()!;
      const { typeName } = writer;
      orderedWriters[typeName] = orderedWriters[typeName] || [];
      orderedWriters[typeName].push(writer);
      const children = writer.spawn();
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }

    let offset = 0;
    for (const writers of Object.values(orderedWriters)) {
      for (const writer of writers) {
        offset = writer.allocate(offset);
      }
    }

    const buffer = new ArrayBuffer(offset);
    const dv = new DataView(buffer);

    const stringWriter = createStringWriter(offset);
    for (const writer of orderedWriters.String) {
      writer.write(dv, stringWriter);
    }
    const stringBuffer = stringWriter.export();

    const bitmaskWriter = createBitmaskWriter(offset + stringBuffer.length);
    for (const [typeName, writers] of Object.entries(orderedWriters)) {
      if (typeName === 'String') continue;
      for (const writer of writers) {
        writer.write(dv, bitmaskWriter);
      }
    }
    const bitmaskBuffer = bitmaskWriter.export();

    const combined = new Uint8Array(
      buffer.byteLength + stringBuffer.length + bitmaskBuffer.length
    );
    combined.set(new Uint8Array(buffer), 0);
    combined.set(stringBuffer, buffer.byteLength);
    combined.set(bitmaskBuffer, buffer.byteLength + stringBuffer.length);

    return combined;
  }
}

/* eslint-disable dot-notation */
import { LazyArray } from './LazyArray';
import {
  bitToIndex,
  oneOfToIndex,
  backwardMapIndexes,
  backwardMapOneOf
} from '../helpers/bitmask';
import { createStringWriter, createBitmaskWriter } from '../helpers/io';

import { ValueError } from '../helpers/error';

import type {
  Schema,
  SchemaPrimitiveType,
  SchemaCompoundType,
  SchemaNamedTupleType
} from '../schema/index.js';

export function encodeWithSchema(data: any, schema: Schema, rootType: string) {
  class Writer {
    typeName: string;
    currentType: Schema[string];
    currentSource: LazyArray<any>;
    currentOffset = -1;
    bitmasks: Iterable<number>[] = [];
    branches: any[] = [];

    constructor(type: string, source: LazyArray<any>) {
      this.typeName = type;
      this.currentType = schema[type];
      this.currentSource = source;

      if (isReference.has(type) && !(this instanceof WriterGroup)) {
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

    isNull() {
      return this.currentSource.length === 0;
    }

    spawn() {
      if (this.isPrimitive() || this.isRef() || this.isNull()) {
        return [];
      }

      const { currentType, currentSource: _currentSource } = this;
      const nextBranches: Writer[] = [];

      const { transform } = currentType;
      const currentSource = transform
        ? _currentSource.map(transform).eagerEvaluate()
        : _currentSource.eagerEvaluate();

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
        const writers = currentSource
          .map((value: ArrayLike<any>) => {
            const nextSource = new LazyArray(value);
            return new Writer(nextType, nextSource);
          })
          .copyTo(Array) as Writer[];
        nextBranches.push(
          writers.length > 1 ? new WriterGroup(writers) : writers[0]
        );
      } else if (this.isMap()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Map'>;
        const keyWriters = currentSource
          .map((value: Record<string, any>) => {
            const keyNextSource = new LazyArray(Object.keys(value));
            return new Writer('String', keyNextSource);
          })
          .copyTo(Array) as Writer[];
        const valWriters = currentSource
          .map((value: Record<string, any>) => {
            const valueNextSource = new LazyArray(Object.values(value));
            return new Writer(nextType, valueNextSource);
          })
          .copyTo(Array) as Writer[];
        nextBranches.push(
          keyWriters.length > 1 ? new WriterGroup(keyWriters) : keyWriters[0],
          valWriters.length > 1 ? new WriterGroup(valWriters) : valWriters[0]
        );
      } else if (this.isOptional()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Optional'>;
        const currentLength = currentSource.length;

        const discriminator = currentSource.map(value =>
          value == null ? 1 : 0
        );

        const bitmask = bitToIndex(discriminator);
        this.bitmasks.push(bitmask);

        const nextSource = new LazyArray(
          currentSource._get,
          backwardMapIndexes(currentLength, bitmask).asInt32Array()
        );
        nextBranches.push(new Writer(nextType, nextSource));
      } else if (this.isOneOf()) {
        const { children } = currentType as SchemaCompoundType<'OneOf'>;
        const currentLength = currentSource.length;

        const discriminator = currentSource.map(value => {
          for (let k = 0; k < children.length; k++) {
            const nextType = schema[children[k]];
            if (nextType.check!(value)) return k;
          }
          throw new ValueError(
            `Value ${value} does not match any of the OneOf types`
          );
        });

        const bitmasks = oneOfToIndex(discriminator, children.length);
        this.bitmasks.push(...bitmasks);

        const backwardIndexes = backwardMapOneOf(currentLength, ...bitmasks);
        backwardIndexes.forEach((indexes, k) => {
          const nextType = children[k];
          const nextSource = new LazyArray(
            currentSource._get,
            indexes.asInt32Array()
          );
          nextBranches.push(new Writer(nextType, nextSource));
        });
      }

      this.branches = nextBranches;
      return nextBranches;
    }

    allocate(offset: number) {
      if (this.isNull()) return offset;

      this.currentOffset = offset;
      const { currentType, currentSource, branches } = this;

      if (
        this.isPrimitive() ||
        this.isRef() ||
        this.isArray() ||
        this.isMap()
      ) {
        const { size } = currentType as SchemaPrimitiveType;
        return offset + size * currentSource.length;
      }

      if (this.isTuple() || this.isNamedTuple()) {
        const { size, children } = currentType as SchemaCompoundType<'Tuple'>;
        return offset + size * children.length;
      }

      if (this.isOptional()) {
        const { size } = currentType as SchemaCompoundType<'Optional'>;
        return offset + size;
      }

      if (this.isOneOf()) {
        const { size } = currentType as SchemaCompoundType<'OneOf'>;
        return offset + size * branches.length - 8;
      }

      throw new TypeError(`Allocation not implemented for ${currentType.type}`);
    }

    write(dataView: DataView, ...args: any[]) {
      if (this.isNull()) return;
      const { currentOffset, currentType, currentSource, branches, bitmasks } =
        this;

      if (this.isPrimitive()) {
        const { size, encode } = currentType as SchemaPrimitiveType;
        currentSource.forEach((value, i) => {
          const offset = currentOffset + i * size;
          encode(dataView, offset, value, ...args);
        });

      } else if (this.isTuple() || this.isNamedTuple()) {
        const { size } = currentType as SchemaCompoundType<'Tuple'>;
        branches.forEach((branch, i) => {
          const offset = currentOffset + i * size;
          dataView.setUint32(offset, branch.currentOffset, true);
        });

      } else if (this.isArray()) {
        const { size } = currentType as SchemaCompoundType<'Array'>;
        const [valWriterGroup] = branches as [WriterGroup];
        valWriterGroup.writers.forEach((child, i) => {
          const offset = currentOffset + i * size;
          dataView.setUint32(offset, child.currentOffset, true);
          dataView.setUint32(offset + 4, child.currentSource.length, true);
        });

      } else if (this.isMap()) {
        const { size } = currentType as SchemaCompoundType<'Map'>;
        const [keyWriterGroup, valWriterGroup] = branches as [
          WriterGroup,
          WriterGroup
        ];
        keyWriterGroup.writers.forEach((child, i) => {
          const offset = currentOffset + i * size;
          dataView.setUint32(offset, child.currentOffset, true);
        });
        valWriterGroup.writers.forEach((child, i) => {
          const offset = currentOffset + i * size + 4;
          dataView.setUint32(offset + 4, child.currentOffset, true);
          dataView.setUint32(offset + 8, child.currentSource.length, true);
        });

      } else if (this.isOptional()) {
        const bitmaskWriter: ReturnType<typeof createBitmaskWriter> = args[0];
        const [valWriter] = branches as [Writer];
        const [bitmask] = bitmasks;
        const [bitmaskOffset, bitmaskLength] = bitmaskWriter.write(
          bitmask,
          currentSource.length
        );
        dataView.setUint32(currentOffset, bitmaskOffset, true);
        dataView.setUint32(currentOffset + 4, bitmaskLength, true);
        dataView.setUint32(currentOffset + 8, valWriter.currentOffset, true);

      } else if (this.isOneOf()) {
        const bitmaskWriter: ReturnType<typeof createBitmaskWriter> = args[0];
        const { size } = currentType as SchemaCompoundType<'OneOf'>;
        branches.forEach((branch, i) => {
          const offset = currentOffset + i * size;
          dataView.setUint32(offset, branch.currentOffset, true);
          if (i < branches.length - 1) {
            const [bitmaskOffset, bitmaskLength] = bitmaskWriter.write(
              bitmasks[i],
              currentSource.length
            );
            dataView.setUint32(offset + 4, bitmaskOffset, true);
            dataView.setUint32(offset + 8, bitmaskLength, true);
          }
        });

      } else if (this.isRef()) {
        const { size } = currentType as SchemaCompoundType<'Ref'>;
        currentSource.forEach((value, i) => {
          const ref = references.get(value);
          if (!ref) {
            throw new ValueError('Reference object outside of scope');
          }
          const [writer, index] = ref;
          const offset = currentOffset + i * size;
          dataView.setUint32(offset, writer.currentOffset, true);
          dataView.setUint32(offset + 4, index, true);
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
        if (children.length === 0) continue;
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

  const isReference = new Set<string>();
  Object.values(schema).forEach(record => {
    if (record.type === 'Ref') {
      isReference.add(record.children[0]);
    }
  });

  const references = new Map<any, [Writer, number]>();

  const orderedWriters: Record<string, Writer[]> = {};
  const stack: Writer[] = [];
  const root = new Writer(rootType, new LazyArray(() => data, 1));
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
  for (const writer of orderedWriters['String']) {
    writer.write(dv, stringWriter);
  }
  const stringBuffer = stringWriter.export();

  const bitmaskWriter = createBitmaskWriter(offset + stringBuffer.length);
  for (const [type, writers] of Object.entries(orderedWriters)) {
    if (type === 'String') continue;
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

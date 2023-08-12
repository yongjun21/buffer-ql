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
    currentSource: any[];
    currentOffset = -1;
    bitmasks: number[] = [];
    children: any[] = [];

    constructor(type: string, source: any[]) {
      this.typeName = type;
      this.currentType = schema[type];
      this.currentSource = source;

      if (this instanceof WriterGroup) return this;
      organizedByType[type] = organizedByType[type] || [];
      organizedByType[type].push(this);

      if (isReference.has(type)) {
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

    spawn() {
      const { currentType, currentSource } = this;
      const nextChildren: Writer[] = [];

      if (this.isPrimitive() || this.isRef() || currentSource.length === 0) {
        return nextChildren;
      } else if (this.isTuple()) {
        const { children } = currentType as SchemaCompoundType<'Tuple'>;
        children.forEach((nextType, i) => {
          const { transform } = schema[nextType];
          const nextSource = currentSource.map(
            transform ? value => transform(value[i]) : value => value[i]
          );
          nextChildren.push(new Writer(nextType, nextSource));
        });
      } else if (this.isNamedTuple()) {
        const { children, keyIndex } = currentType as SchemaNamedTupleType;
        const childKeys = Object.keys(keyIndex);
        children.forEach((nextType, i) => {
          const { transform } = schema[nextType];
          const k = childKeys[i];
          const nextSource = currentSource.map(
            transform ? value => transform(value[k]) : value => value[k]
          );
          nextChildren.push(new Writer(nextType, nextSource));
        });
      } else if (this.isArray()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Array'>;
        const { transform } = schema[nextType];

        const writers = currentSource.map((value: ArrayLike<any>) => {
          const nextSource = transform ? transform(value) : value;
          return new Writer(nextType, nextSource);
        });
        nextChildren.push(
          writers.length > 1 ? new WriterGroup(writers) : writers[0]
        );
      } else if (this.isMap()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Map'>;
        const { transform } = schema[nextType];

        const keyWriters: Writer[] = [];
        const valWriters: Writer[] = [];
        currentSource.forEach((value: Record<string, any>) => {
          value = transform ? transform(value) : value;
          const keyNextSource = Object.keys(value);
          const valueNextSource = Object.values(value);
          keyWriters.push(new Writer('String', keyNextSource));
          valWriters.push(new Writer(nextType, valueNextSource));
        });
        nextChildren.push(
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
        const [bitmaskOffset, bitmaskLength] = bitmaskWriter.write(
          bitmask,
          currentLength
        );
        this.bitmasks.push(bitmaskOffset, bitmaskLength);

        const nextSource = new LazyArray(
          currentSource,
          backwardMapIndexes(currentLength, bitmask).asInt32Array()
        ).copyTo(Array);
        nextChildren.push(new Writer(nextType, nextSource));
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
        bitmasks.forEach(bitmask => {
          const [bitmaskOffset, bitmaskLength] = bitmaskWriter.write(
            bitmask,
            currentLength
          );
          this.bitmasks.push(bitmaskOffset, bitmaskLength);
        });

        const backwardIndexes = backwardMapOneOf(currentLength, ...bitmasks);
        backwardIndexes.forEach((indexes, k) => {
          const nextType = children[k];
          const nextSource = new LazyArray(
            currentSource,
            indexes.asInt32Array()
          ).copyTo(Array);
          nextChildren.push(new Writer(nextType, nextSource));
        });
      }

      this.children = nextChildren;
      return nextChildren;
    }

    measure() {

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
      const _nextChildren: Writer[][] = [];
      for (const writer of this.writers) {
        const children = writer.spawn();
        if (children.length === 0) continue;
        for (let i = 0; i < children.length; i++) {
          _nextChildren[i] = _nextChildren[i] || [];
          _nextChildren[i].push(children[i]);
        }
      }
      const nextChildren: Writer[] = _nextChildren.map(
        writers => writers.length > 1 ? new WriterGroup(writers) : writers[0]
      );
      this.children = nextChildren;
      return nextChildren;
    }
  }

  const stringWriter = createStringWriter();
  const bitmaskWriter = createBitmaskWriter();

  const isReference = new Set<string>();
  Object.values(schema).forEach(type => {
    if (type.type === 'Ref') {
      isReference.add(type.children[0]);
    }
  });

  const references = new Map<any, [Writer, number]>();

  const organizedByType: Record<string, Writer[]> = {};

  const stack: Writer[] = [];
  const root = new Writer(rootType, [data]);
  stack.push(root);

  while (stack.length > 0) {
    const writer = stack.pop()!;
    const children = writer.spawn();
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }

  let offset = 0;

  for (const [type, writers] of Object.entries(organizedByType)) {
    // allocate space and set offsets
  }

  for (const [type, writers] of Object.entries(organizedByType)) {
    // perform write
  }
}

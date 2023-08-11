import { LazyArray } from './LazyArray';
import { bitToIndex, oneOfToIndex, backwardMapIndexes, backwardMapOneOf } from '../helpers/bitmask';
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
    bitmasks: number[] = [];
    children: any[] = [];

    constructor(type: string, source: LazyArray<any>) {
      this.typeName = type;
      this.currentType = schema[type];
      this.currentSource = source;

      organizedByType[type] = organizedByType[type] || [];
      organizedByType[type].push(this);

      if (isReference.has(type)) {
        source.forEach((value, i) => references.set(value, [this, i]))
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
          const nextSource = new LazyArray(
            currentSource
              .map(transform ? value => transform(value[i]) : value => value[i])
              .copyTo(Array)
          );
          nextChildren.push(new Writer(nextType, nextSource));
        });
      } else if (this.isNamedTuple()) {
        const { children, keyIndex } = currentType as SchemaNamedTupleType;
        const childKeys = Object.keys(keyIndex);
        children.forEach((nextType, i) => {
          const { transform } = schema[nextType];
          const k = childKeys[i];
          const nextSource = new LazyArray(
            currentSource
              .map(transform ? value => transform(value[k]) : value => value[k])
              .copyTo(Array)
          );
          nextChildren.push(new Writer(nextType, nextSource));
        });
      } else if (this.isArray()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Array'>;

        currentSource.forEach(value => {
          const nextSource = value.copyTo(Array);
          nextChildren.push(new Writer(nextType, nextSource));
        });
      } else if (this.isMap()) {
        
      } else if (this.isOptional()) {
        const {
          children: [nextType]
        } = currentType as SchemaCompoundType<'Optional'>;
        const currentLength = currentSource.length;
        const discriminator = currentSource.map(value => (value == null ? 1 : 0));
        const bitmask = bitToIndex(discriminator);
        const [bitmaskOffset, bitmaskLength] = bitmaskWriter.write(
          bitmask,
          currentLength
        );
        this.bitmasks.push(bitmaskOffset, bitmaskLength);
        const nextSource = new LazyArray(
          currentSource._get,
          backwardMapIndexes(currentLength, bitmask).asInt32Array()
        );
        nextChildren.push(new Writer(nextType, nextSource));
      } else if (this.isOneOf()) {
        const { children } = currentType as SchemaCompoundType<'OneOf'>;
        const currentLength = currentSource.length;
        const discriminator = currentSource.map(value => {
          for (let k = 0; k < children.length; k++) {
            const nextType = schema[children[k]];
            if (nextType.check!(value)) return k;
          }
          throw new ValueError(`Value ${value} does not match any of the OneOf types`);
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
            currentSource._get,
            indexes.asInt32Array()
          );
          nextChildren.push(new Writer(nextType, nextSource));
        });
      }

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
  const root = new Writer(rootType, new LazyArray([data]));
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

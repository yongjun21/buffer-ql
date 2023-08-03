import type { Modifier } from '../types/common.js';
import type { SchemaCompoundType } from '../schema/index.js';

export type SchemaTypeModifierName = 'Array' | 'Map' | 'Optional' | 'OneOf';

type NestWithoutReplacement<T extends string, U extends string> = {
  [K in T]: Modifier<K, U | Modifier<Exclude<T, K>, U>>;
}[T];

type OneOfPair<T extends string> = {
  [K in T]: `${K},${Exclude<T, K>}`;
}[T];

type OneOfTriplet<T extends string> = {
  [K in T]: `${K},${OneOfPair<Exclude<T, K>>}`;
}[T];

export type SchemaCompoundTypeExpression<T extends string> =
  | NestWithoutReplacement<'Array' | 'Map' | 'Optional', T>
  | Modifier<'OneOf', OneOfPair<T> | OneOfTriplet<T>>;

export function parseExpression(label: string, exp: string) {
  const parsed: Record<string, SchemaCompoundType> = {};
  const tokenized: [number, string][] = [];
  const pattern = /((Array|Map|Optional|OneOf)<)|(([A-Za-z0-9_]+),?)|>/y;
  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(exp)) != null) {
    if (matched[1]) {
      tokenized.push([1, matched[2]]);
    } else if (matched[3]) {
      tokenized.push([0, matched[4]]);
    } else {
      tokenized.push([-1, '']);
    }
  }
  interface StackItem {
    label: string;
    type: SchemaCompoundType;
  }
  const stack: StackItem[] = [];
  let curr: StackItem | undefined;
  tokenized.forEach(([action, token]) => {
    if (action === 1) {
      const type = {
        size: 0,
        modifier: token as SchemaTypeModifierName,
        children: []
      };
      const next = { label, type };
      label += "'";
      parsed[next.label] = next.type;

      if (curr) stack.push(curr);
      curr = next;
    } else if (action === 0) {
      if (curr) curr.type.children.push(token);
    } else {
      if (curr) {
        curr.type.size = getTypeSize(curr.type.modifier, curr.type.children);
      }
      const top = stack.pop();
      if (top && curr) {
        top.type.children.push(curr.label);
      }
      curr = top;
    }
  });
  return parsed;
}

function getTypeSize(modifier: SchemaTypeModifierName, children: string[]) {
  switch (modifier) {
    case 'Array':
      return 8; // offset + length
    case 'Map':
      return 12; // offset to keys + offset to values + length
    case 'Optional':
      return 20; // (offset + length) to bitmask + unpacked length + (offset + length) to packed value
    case 'OneOf':
      return (children.length - 1) * 16 + 12; // (N - 1) x (offset + length) to bitmask + unpacked length + N x (offset + length) to packed value
  }
}

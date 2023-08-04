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
  const parsed: Record<string, SchemaCompoundType<SchemaTypeModifierName>> = {};
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
    record: SchemaCompoundType<SchemaTypeModifierName>;
  }
  const stack: StackItem[] = [];
  let curr: StackItem | undefined;
  tokenized.forEach(([action, token]) => {
    if (action === 1) {
      const record: SchemaCompoundType<SchemaTypeModifierName> = {
        type: token as SchemaTypeModifierName,
        size: 0,
        children: []
      };
      const next = { label, record };
      label += "'";
      parsed[next.label] = next.record;

      if (curr) stack.push(curr);
      curr = next;
    } else if (action === 0) {
      if (curr) curr.record.children.push(token);
    } else {
      if (curr) {
        curr.record.size = getTypeSize(curr.record.type, curr.record.children);
      }
      const top = stack.pop();
      if (top && curr) {
        top.record.children.push(curr.label);
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
      return 16; // (offset + length) to bitmask + (offset + length) to value
    case 'OneOf':
      // offset to branch0 + (offset + length) to bitmask0 +
      // offset to branch1 + (offset + length) to bitmask1 + ...
      // offset to branchN + unpacked length
      return (children.length - 1) * 12 + 8;
  }
}

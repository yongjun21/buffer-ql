import { validateTransitions } from '../helpers/stateMachine.js';

import { TypeError } from '../core/error.js';

import type { Modifier } from '../types/common.js';
import type { SchemaCompoundType } from '../schema/index.js';

export type SchemaTypeModifierName =
  | 'Array'
  | 'Map'
  | 'Optional'
  | 'OneOf'
  | 'Link';

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
  | Modifier<'OneOf', OneOfPair<T> | OneOfTriplet<T>>
  | Modifier<'Link', `${string}/${string}`>;

export function parseExpression(label: string, exp: string) {
  const VALID_TRANSITIONS = {
    '<': ['<', '_'],
    _: ['>', ','],
    ',': ['<', '_'],
    '>': ['>', ',']
  };

  type ValidState = keyof typeof VALID_TRANSITIONS;
  type Parsed = Omit<
    SchemaCompoundType<SchemaTypeModifierName | 'Alias'>,
    'size'
  >;

  const parsed: Record<string, Parsed> = {};
  const tokenized: [ValidState, string][] = [];
  const pattern = /((Array|Map|Optional|OneOf|Link)<)|([A-Za-z0-9_/]+)|(,|>)/y;
  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(exp)) != null) {
    if (matched[1]) {
      tokenized.push(['<', matched[2]]);
    } else if (matched[3]) {
      tokenized.push(['_', matched[3]]);
    } else {
      tokenized.push([matched[4] as ValidState, '']);
    }
  }

  if (tokenized.length === 0) {
    throw new TypeError(`Invalid schema expression: ${exp}`);
  }
  const transitionsValid = validateTransitions(
    [',', ...tokenized.map(([action]) => action), ','],
    (input, output) => VALID_TRANSITIONS[input].includes(output)
  );
  if (!transitionsValid) {
    throw new TypeError(`Invalid schema expression: ${exp}`);
  }

  if (tokenized.length === 1) {
    parsed[label] = { type: 'Alias', children: [tokenized[0][1]] };
    return parsed;
  }

  const stack: { label: string; record: Parsed }[] = [];
  let curr: { label: string; record: Parsed } | undefined;
  tokenized.forEach(([action, token]) => {
    if (action === '<') {
      const record: Parsed = {
        type: token as SchemaTypeModifierName,
        children: []
      };
      const next = { label, record };
      label += "'";
      parsed[next.label] = next.record;

      if (curr) stack.push(curr);
      curr = next;
    } else if (action === '_') {
      if (curr) curr.record.children.push(token);
    } else if (action === '>') {
      const top = stack.pop();
      if (top && curr) {
        top.record.children.push(curr.label);
      }
      curr = top;
    }
  });
  return parsed;
}

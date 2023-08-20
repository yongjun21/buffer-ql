import { validateTransitions } from '../helpers/stateMachine.js';

import { TypeError } from '../helpers/error.js';

import type { Modifier } from '../types/common.js';
import type { SchemaCompoundType } from '../schema/index.js';

export type SchemaTypeModifierName =
  | 'Array'
  | 'Map'
  | 'Optional'
  | 'OneOf'
  | 'Ref'
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
  | Modifier<'Ref', T>
  | Modifier<'Link', `${string}/${string}`>;

const VALID_TRANSITIONS = {
  '<': ['<', '_'],
  _: ['>', ','],
  ',': ['<', '_'],
  '>': ['>', ',']
};
type TokenState = keyof typeof VALID_TRANSITIONS;

export function parseExpression(label: string, exp: string) {
  type Parsed = Omit<SchemaCompoundType<string>, 'size'>;

  const parsed: Record<string, Parsed> = {};
  const tokenized: [TokenState, string][] = [];
  const pattern = /((Array|Map|Optional|OneOf|Ref|Link)<)|([A-Za-z0-9_/]+)|(,|>)/y;
  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(exp)) != null) {
    if (matched[1]) {
      tokenized.push(['<', matched[2]]);
    } else if (matched[3]) {
      tokenized.push(['_', matched[3]]);
    } else {
      tokenized.push([matched[4] as TokenState, '']);
    }
  }

  if (!validateExpression(tokenized.map(([action]) => action))) {
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

function validateExpression(stateTransition: TokenState[]) {
  const transitionsValid = validateTransitions(
    [',', ...stateTransition, ','],
    (input, output) => VALID_TRANSITIONS[input].includes(output)
  );
  if (!transitionsValid) return false;

  let level = 0;
  for (const action of stateTransition) {
    if (action === '<') {
      level++;
    } else if (action === '>') {
      level--;
    } else if (action === ',') {
      if (level < 1) return false;
    }
  }
  return level === 0;
}

export function validateTransitions<T extends string>(
  states: T[],
  predicate: (input: T, output: T) => boolean
) {
  for (let i = 1; i < states.length; i++) {
    if (!predicate(states[i - 1], states[i])) return false;
  }
  return true;
}

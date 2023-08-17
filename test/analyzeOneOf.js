function updateState(curr, next) {
  let moves = 0;
  for (let i = 0; i <= next; i++) {
    if (i >= curr.length) continue;
    const target = i === next ? 0 : 1;
    if (curr[i] !== target) {
      curr[i] = target;
      moves++;
    }
  }
  return moves;
}

function simulate(classes, rounds) {
  let _rounds = rounds
  const state = new Uint8Array(classes - 1);
  let next = 0;
  const stateCount = Math.pow(2, classes - 1);
  const stateTally = new Uint32Array(stateCount);
  const inMovesTally = new Uint32Array(stateCount);
  let movesTally = 0;

  while (_rounds-- > 0) {
    next = (next + 1 + Math.floor((classes - 1) * Math.random())) % classes;
    const moves = updateState(state, next);
    const key = stateToKey(state);
    stateTally[key]++;
    inMovesTally[key] += moves;
    movesTally += moves;
  }

  const avgMoves = movesTally / rounds;
  const avgInMoves = [...inMovesTally].map((v, i) => v / stateTally[i]);

  return [stateTally, avgInMoves, avgMoves];
}

function batchSimulate(batches, rounds) {
  const results = [];
  for (let i = 2; i <= batches; i++) {
    const [_, __, avgMoves] = simulate(i, rounds);
    results.push(avgMoves);
  }
  return results;
}

console.log(batchSimulate(24, 1600000))

function stateToKey(state) {
  let k = 1;
  let key = 0;
  for (let i = state.length - 1; i >= 0; i--) {
    if (state[i]) key += k;
    k *= 2;
  }
  return key;
}

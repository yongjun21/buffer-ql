for (let n = 2; n <= 25; n++) {
  console.log(getExpectedMoves(n));
}
// console.log(simulate(4, 1e6));
// console.log(batchSimulate(24, 1600000));

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

  const stateProb = [...stateTally].map(v => v / rounds);
  const avgMoves = movesTally / rounds;
  const avgInMoves = [...inMovesTally].map((v, i) => v / stateTally[i]);

  return [stateProb, avgInMoves, avgMoves];
}

function batchSimulate(batches, rounds) {
  const results = [];
  for (let i = 2; i <= batches; i++) {
    const [_, __, avgMoves] = simulate(i, rounds);
    results.push(avgMoves);
  }
  return results;
}

// closed form solution
function getExpectedMoves(classes) {
  const n = Math.pow(2, classes - 1);
  const probs = new Float64Array(n);
  let expectedMoves = 0;
  probs[0] = 1;

  for (let i = 0; i < classes - 1; i++) {
    const k = Math.pow(2, i);
    for (let j = k - 1; j >= 0; j--) {
      probs[j * 2 + 1] = probs[j] * (classes - i - 1) / (classes - i);
      probs[j * 2] = probs[j] * 1 / (classes - i);
    }

    let sumProb = 0;
    let sumMoveProb = 0;
    for (let j = 0; j < 2 * k; j++) {
      let move = 0;
      for (let b = 0; b < i + 1; b++) {
        const bit = getBit(j, b);
        if ((b === 0 && bit) || (b > 0 && !bit)) move++;
      }
      if (move === 0) continue;
      sumProb += probs[j];
      sumMoveProb += probs[j] * move;
    }
    expectedMoves += sumMoveProb / sumProb / classes;
  }

  let sumProb = 0;
  let sumMoveProb = 0;
  for (let j = 0; j < Math.pow(2, classes - 1); j++) {
    let move = 0;
    for (let b = 0; b < classes - 1; b++) {
      const bit = getBit(j, b);
      if (!bit) move++;
    }
    if (move === 0) continue;
    sumProb += probs[j];
    sumMoveProb += probs[j] * move;
  }
  expectedMoves += sumMoveProb / sumProb / classes;

  return expectedMoves
}

function stateToKey(state) {
  let k = 1;
  let key = 0;
  for (let i = state.length - 1; i >= 0; i--) {
    if (state[i]) key += k;
    k *= 2;
  }
  return key;
}

function getBit(n, i) {
  return n & (1 << i);
}

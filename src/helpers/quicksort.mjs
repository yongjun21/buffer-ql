export function quicksort(arr, compare = (a, b) => a - b, currentMapping) {
  const mapping = new Uint32Array(arr.length);
  const reverseMapping = new Uint32Array(arr.length);
  for (let i = 0; i < mapping.length; i++) {
    mapping[i] = currentMapping ? currentMapping[i] : i;
    reverseMapping[mapping[i]] = i;
  };

  const stack = [];
  stack.push(0, arr.length - 1);

  while (stack.length > 0) {
    const end = stack.pop();
    const start = stack.pop();

    if (start >= end) continue;
    const pivot = arr[mapping[start]];
    const pivotIndex = mapping[start];
    let i = start;
    let j = end;
    let head = true;
    while (i < j) {
      if (head) {
        if (
          (compare(arr[mapping[j]], pivot) ||
            reverseMapping[mapping[j]] - reverseMapping[pivotIndex]) < 0
        ) {
          mapping[i] = mapping[j];
          head = false;
          i++;
        } else {
          j--;
        }
      } else {
        if (
          (compare(arr[mapping[i]], pivot) ||
            reverseMapping[mapping[i]] - reverseMapping[pivotIndex]) > 0
        ) {
          mapping[j] = mapping[i];
          head = true;
          j--;
        } else {
          i++;
        }
      }
    }
    mapping[i] = pivotIndex;

    stack.push(i + 1, end);
    stack.push(start, i - 1);
  }

  return mapping;
}

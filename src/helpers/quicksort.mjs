const test = [86, 67, 55, 22, 11, 66, 64, 43, 93, 20, 79, 14, 61, 39, 36, 80, 50, 16, 98, 51, 41, 2, 92, 95, 70, 91, 21, 17, 42, 57, 56, 33, 30, 3, 72, 54, 87, 37, 13, 15, 0, 63, 24, 19, 75, 4, 94, 26, 38, 27, 65, 89, 73, 34, 6, 90, 88, 81, 69, 85, 35, 12, 5, 29, 71, 68, 25, 96, 45, 9, 60, 77, 76, 10, 23, 74, 31, 83, 48, 18, 1, 53, 97, 47, 84, 58, 8, 82, 49, 7, 46, 59, 32, 40, 28, 78, 52, 99, 62, 44, 96];
const mapping = quicksort(test, (a, b) => b - a);

console.log(test, test.map((_, i) => test[mapping[i]]));

export function quicksort(arr, compare = (a, b) => a - b) {
  const mapping = new Uint32Array(arr.length);
  for (let i = 0; i < mapping.length; i++) mapping[i] = i;

  const stack = [];
  stack.push(0, arr.length - 1);

  while (stack.length > 0) {
    const end = stack.pop();
    const start = stack.pop();

    if (start >= end) continue;
    const pivot = arr[mapping[start]];
    const startIndex = mapping[start];
    let i = start;
    let j = end;
    let head = true;
    while (i < j) {
      if (head) {
        if (compare(arr[mapping[j]], pivot) < 0) {
          mapping[i] = mapping[j];
          head = false;
          i++;
        } else {
          j--;
        }
      } else {
        if (compare(arr[mapping[i]], pivot) >= 0) {
          mapping[j] = mapping[i];
          head = true;
          j--;
        } else {
          i++;
        }
      }
    }
    mapping[i] = startIndex;

    stack.push(i + 1, end);
    stack.push(start, i - 1);
  }

  return mapping;
}


import assert from 'assert';
import {
  getEncodedDummyDataJS,
  getEncodedDummyDataPY
} from './getEncodedDummyData.js';

const jsEncoded = getEncodedDummyDataJS();
const pyEncoded = getEncodedDummyDataPY();

assert(jsEncoded.every((v, i) => v === pyEncoded[i]));

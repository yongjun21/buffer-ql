import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encodeWithSchema } from '../dist/index.js';

import DUMMY_DATA from './dummyData.json' assert { type: 'json' };
import { SCHEMA } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { trackedEntities, trackedEntitiesOfInterest } = DUMMY_DATA;

for (const key in trackedEntitiesOfInterest) {
  trackedEntitiesOfInterest[key] = trackedEntities[trackedEntitiesOfInterest[key]];
}

export function getEncodedDummyDataJS() {
  return encodeWithSchema(DUMMY_DATA, SCHEMA, '#');
}

export function getEncodedDummyDataPY() {
  const buffer = fs.readFileSync(path.join(__dirname, 'encodedPY.bin'));
  return new Uint8Array(buffer);
}

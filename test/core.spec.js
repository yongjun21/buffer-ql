import { encodeWithSchema } from '../dist/core/writer.js';
import { createReader, ALL_VALUES } from '../dist/core/reader.js';

import trackedEntities from './dummyData.json' assert { type: 'json' };
import { SCHEMA } from './schema.js';

const DUMMY_DATA = {
  trackedEntities,
  trackedEntitiesOfInterest: {
    nearest: trackedEntities[0],
    mostConstraining: trackedEntities[2]
  }
};

const encoded = encodeWithSchema(DUMMY_DATA, SCHEMA, '#');

const Reader = createReader(encoded.buffer, SCHEMA);

const reader = new Reader('#', 0)
  .get('trackedEntitiesOfInterest')
  .get('nearest')
  .get('waypoints')
  .get(ALL_VALUES)
  .get('probability');

const decoded = reader.value()?.copyTo(Array);

console.log(decoded);

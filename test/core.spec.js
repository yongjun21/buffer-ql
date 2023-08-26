import { encodeWithSchema, createReader, ALL_VALUES, LazyArray } from '../dist/index.js';

import DUMMY_DATA from './dummyData.json' assert { type: 'json' };
import { SCHEMA } from './schema.js';

const { trackedEntities, trackedEntitiesOfInterest } = DUMMY_DATA;

for (const key in trackedEntitiesOfInterest) {
  trackedEntitiesOfInterest[key] = trackedEntities[trackedEntitiesOfInterest[key]];
}

const encoded = encodeWithSchema(DUMMY_DATA, SCHEMA, '#');

const Reader = createReader(encoded.buffer, SCHEMA);

const trackedEntitiesReader = new Reader('#', 0).get('trackedEntities');

const waypointsReader = trackedEntitiesReader.get(ALL_VALUES).get('waypoints');

const waypointsPoseReader = waypointsReader
  .get(ALL_VALUES)
  .get('pose')
  .get('position');

const decoded = waypointsPoseReader.value();
const dumped = waypointsPoseReader.dump(Float32Array);
console.log(decoded);
console.log(dumped);

const collapsed = LazyArray.iterateNested(decoded, v => v != null);
console.log([...collapsed.values]);
console.log([...collapsed.startIndices]);

console.log(LazyArray.getNestedSize(decoded, v => v != null));
console.log(LazyArray.getNestedDepth(decoded));

const filtered = trackedEntitiesReader
  .get(ALL_VALUES)
  .apply.filter(v => v === 2)
  .on(reader => reader.get('class'))
  .get('waypoints')
  .apply.dropNull()
  .on()
  .get(ALL_VALUES)
  .apply.forEach.dropNull()
  .on(reader => reader.get('probability'))
  .apply.forEach.filter(v => v > 0.5)
  .on(reader => reader.get('probability'))
  .get('pose')
  .get('position');

console.log(filtered.value());

const trackedEntitiesSourceIdReader = trackedEntitiesReader
  .get(ALL_VALUES)
  .get('source')
  .get(1)
  .apply.filter(v => typeof v === 'number')
  .on();
console.log(trackedEntitiesSourceIdReader.value());

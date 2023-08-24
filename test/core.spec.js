import { encodeWithSchema } from '../dist/core/writer.js';
import { createReader, ALL_VALUES } from '../dist/core/reader.js';
import { LazyArray } from '../dist/core/LazyArray.js';

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

const trackedEntitiesReader = new Reader('#', 0).get('trackedEntities');

const waypointsReader = trackedEntitiesReader.get(ALL_VALUES).get('waypoints');

const waypointsPoseReader = waypointsReader
  .get(ALL_VALUES)
  .get('pose')
  .get('position');

// const trackedEntitiesSourceIdReader = trackedEntitiesReader.get(ALL_VALUES).get('source').get(1);

// const decoded = waypointsPoseReader.value();
// const dumped = waypointsPoseReader.dump(Float32Array);

// console.log(decoded);
// console.log(dumped);

// const collapsed = LazyArray.iterateNested(decoded, v => v != null);

// console.log([...collapsed.values]);
// console.log([...collapsed.startIndices]);

// console.log(LazyArray.getNestedSize(decoded, v => v != null));
// console.log(LazyArray.getNestedDepth(decoded));

const filtered = trackedEntitiesReader
  .get(ALL_VALUES)
  .split()
  .filter(reader => reader.get('class').value() === 3)
  .map(reader => reader.get('waypoints').get(ALL_VALUES))
  .filter(reader => !reader.isUndefined())
  .map(reader => {
    return reader
      .split()
      .filter(reader => !reader.get('probability').isUndefined())
      .combine()
  })
  .combine();

console.log(filtered.value());

// console.log(trackedEntitiesSourceIdReader.value());

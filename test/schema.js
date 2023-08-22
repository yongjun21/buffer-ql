import { extendSchema } from '../dist/schema/index.js';

export const SCHEMA = extendSchema(
  {
    SourceTypeEnum: {
      size: 1,
      decode: (dv, offset) => ['Lidar', 'Camera'][dv.getUint8(offset)],
      encode: (dv, offset, value) => {
        dv.setUint8(offset, ['Lidar', 'Camera'].indexOf(value));
      }
    }
  },
  {
    '#': {
      trackedEntities: 'Array<TrackedEntity>',
      trackedEntitiesOfInterest: 'Map<TrackedEntityRef>',
    },
    TrackedEntity: {
      id: 'Int32',
      class: 'Uint8',
      pose: 'Pose',
      velocity: 'Optional<Vector3>',
      source: 'TrackedEntitySource',
      waypoints: 'Optional<Array<TrackedEntityWayPoint>>'
    },
    TrackedEntityWayPoint: {
      timestamp: 'Int32',
      pose: 'Pose',
      probability: 'Optional<Float32>',
    },
    Pose: {
      position: 'Vector3',
      rotation: 'Vector3',
      size: 'Vector3'
    },
    TrackedEntitySource: ['SourceTypeEnum', 'OneOf<String,Int32>', 'Optional<String>'],
    TrackedEntityRef: 'Ref<TrackedEntity>',
  }
);

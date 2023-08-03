import { extendSchema } from '../src/schema/index';

export const SCHEMA = extendSchema(
  {
    XYZ: {
      size: 3 * 4,
      read: (dv, offset) => new Float32Array(dv.buffer, offset, 3)
    },
    XYZW: {
      size: 4 * 4,
      read: (dv, offset) => new Float32Array(dv.buffer, offset, 4)
    },
  },
  {
    PoseAlias: 'Pose',
    Pose: {
      id: 'Optional<Id>',
      position: 'XYZ',
      rotation: 'XYZW',
      history: 'Optional<Array<TimestampedPose>>',
    },
    Id: 'OneOf<Uint32,String,Int32>',
    TimestampedPose: [
      'Uint32',
      'Optional<Pose>',
    ],
  }
);

console.log(SCHEMA);

import { extendSchema } from '../src/schema/index.js';

export const SCHEMA = extendSchema(
  {
    XYZ: {
      size: 3 * 4,
      encode: (dv, offset) => new Float32Array(dv.buffer, offset, 3),
      decode: () => undefined,
    },
    XYZW: {
      size: 4 * 4,
      encode: (dv, offset) => new Float32Array(dv.buffer, offset, 4),
      decode: () => undefined,
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
    Linked: 'Link<AnotherSchema/AnotherType>'
  },
  {
    Pose: v => v
  },
  {
    XYZ: v => true
  }
);

console.log(SCHEMA);

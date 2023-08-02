import { extendSchema } from '../src/schema/index.js';

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
    Alias: 'Pose',
    Pose: {
      position: 'XYZ',
      rotation: 'XYZW',
      next: 'Ref<Pose>',
    },
  }
);

import { extendSchema } from '../src/schema/index.js';

export const SCHEMA = extendSchema(
  {
    Vector9: {
      size: 9 * 4,
      read: (dv, offset) => new Float32Array(dv.buffer, offset, 9)
    },
    Pose: {
      children: {
        position: 'Vector3',
        rotation: 'Vector3',
        next: 'Pose',
        related: 'Array<Pose>',
        prev: 'Ref<Pose>'
      }
    },
    Pose2: {
      children: {
        position: 'Vector3',
        rotation: 'Vector3',
        next: 'Pose',
        related: 'Array<Pose>',
        prev: 'Ref<Vector9>'
      }
    }
  },
  { '#root': 'Pose', '#test': 'Pose2' }
);

export const SCHEMA_COMPOUND_TYPES = [
  // arrays are just pointers
  { name: 'Array', size: 8 },
  // pointer to keys + pointer to values
  { name: 'Map', size: 16 },
  // pointer to bitmask + pointer to T + original
  { name: 'Optional', size: 20 },
  // same structure as bitmask 
  { name: 'OneOf', size: 20 },
  // references are just offsets
  { name: 'Ref', size: 4 },
] as const;

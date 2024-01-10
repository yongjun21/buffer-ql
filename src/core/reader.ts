import { Reader } from './Readers.js';

import type { Schema } from '../schema/index.js';

export { ALL_KEYS, ALL_VALUES } from './Readers.js';

export function createReader(data: ArrayBuffer | DataView, schema: Schema) {
  const dataView = data instanceof DataView ? data : new DataView(data);
  const sizeHeader = dataView.getUint8(0);
  class BaseReader extends Reader {
    static dataView = dataView;
    static schema = schema;
    static linkedReaders = super.linkedReaders;
    static indexSize = sizeHeader >> 4;
    static lengthSize = sizeHeader & 15;
  }
  return BaseReader as typeof Reader;
}

export function linkReaders(Readers: Record<string, typeof Reader>) {
  const schemaKeys = Object.keys(Readers);
  schemaKeys.forEach(keyA => {
    schemaKeys.forEach(keyB => {
      if (keyA === keyB) return;
      Readers[keyA].addLink(keyB, Readers[keyB]);
      Readers[keyB].addLink(keyA, Readers[keyA]);
    });
  });
}

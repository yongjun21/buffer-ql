def write_varint(dv, offset, value, signed=False):
    if signed:
        value = (value << 1) ^ (value >> 63)
    while value > 127:
        dv[offset] = (value & 127) | 128
        offset += 1
        value >>= 7
    dv[offset] = value


def size_varint(value, signed=False):
    if signed:
        value = (value << 1) ^ (value >> 63)
    size = 1
    while value > 127:
        size += 1
        value >>= 7
    return size


def write_prefixed_varint(buffer, offset, value):
    while value > 127:
        buffer.append((value & 127) | 128)
        offset += 1
        value >>= 7
    buffer.append(value)
    offset += 1
    return offset


def size_string(value, db):
    encoded = value.encode('utf-8')
    return db.put(encoded, value)


class Data_Tape:
    def __init__(self):
        self.buffer = bytearray()
        self.offset = 0
        self.offset_delta = 0
        self.index = {}

    @staticmethod
    def write(dv, offset, value, db):
        return write_varint(dv, offset, db.get(value), True)
    
    def get(self, key):
        i = self.index.get(key, None)
        return -1 if i is None else i + self.offset_delta
    
    def put(self, value, key):
        if key in self.index:
            return 0
        self.index[key] = self.offset
        curr_offset = self.offset
        next_offset = write_prefixed_varint(self.buffer, self.offset, len(value)) + len(value)
        self.buffer.extend(value)
        self.offset = next_offset
        return next_offset - curr_offset
    
    def shift(self, to):
        self.offset_delta = to

    def export(self):
        return self.buffer

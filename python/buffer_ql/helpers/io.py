from collections import namedtuple
from .bitmask import encode_bitmask

Writer = namedtuple("Writer", ["write", "export"])


def read_prefixed_varint(dv, offset):
    value = 0
    shift = 0
    while True:
        byte = dv[offset]
        value |= (byte & 128) << shift
        offset += 1
        if not (byte & 128):
            break
        shift += 7
    return value, offset


def read_string(dv, offset):
    _offset, _length = read_prefixed_varint(dv, offset)
    return dv[_offset: _offset + _length].decode("utf-8")


def read_bitmask(dv, offset):
    _offset, _length = read_prefixed_varint(dv, offset)
    return dv[_offset: _offset + _length]


def create_string_writer(start_offset=0):
    buffer = bytearray()
    offset = 0

    def write(input_str):
        nonlocal offset
        encoded = input_str.encode('utf-8')
        length_varint = encode_varint(len(encoded))
        buffer.extend(length_varint)
        buffer.extend(encoded)
        output = start_offset + offset
        offset += len(length_varint) + len(encoded)
        return output

    def export():
        return buffer

    return Writer(write, export)


def create_bitmask_writer(start_offset=0):
    buffer = bytearray()
    offset = 0

    def write(bitmask, max_index, no_of_classes=1):
        nonlocal offset
        n = max_index * no_of_classes + no_of_classes - 1
        encoded = encode_bitmask(bitmask, n)
        length_varint = encode_varint(len(encoded))
        buffer.extend(length_varint)
        buffer.extend(encoded)
        output = start_offset + offset
        offset += len(length_varint) + len(encoded)
        return output

    def export():
        return buffer

    return Writer(write, export)


def encode_varint(value, signed=False):
    if signed:
        value = (value << 1) ^ (value >> 63)
    bytes = []
    while value > 127:
        bytes.append((value & 127) | 128)
        value >>= 7
    bytes.append(value)
    return bytes

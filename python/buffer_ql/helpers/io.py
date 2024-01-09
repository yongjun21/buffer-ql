from collections import namedtuple
from .bitmask import encode_bitmask

Writer = namedtuple("Writer", ["write", "export"])

def write_varint(dv, offset, value, signed=False):
    if signed:
        value = (value << 1) ^ (value >> 63)
    while value > 127:
        dv[offset] = (value & 127) | 128
        offset += 1
        value >>= 7
    dv[offset] = value


def write_prefixed_varint(buffer, offset, value):
    while value > 127:
        buffer.append((value & 127) | 128)
        offset += 1
        value >>= 7
    buffer.append(value)
    offset += 1
    return offset


def create_string_writer(start_offset=0):
    buffer = bytearray()
    offset = 0

    def write(input_str):
        nonlocal offset
        encoded = input_str.encode('utf-8')
        curr_offset = offset
        encoded_offset = write_prefixed_varint(buffer, offset, len(encoded))
        buffer.extend(encoded)
        offset = encoded_offset + len(encoded)
        return start_offset + curr_offset

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
        curr_offset = offset
        encoded_offset = write_prefixed_varint(buffer, offset, len(encoded))    
        buffer.extend(encoded)
        offset = encoded_offset + len(encoded)
        return start_offset + curr_offset

    def export():
        return buffer

    return Writer(write, export)

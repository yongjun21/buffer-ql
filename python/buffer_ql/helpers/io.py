from collections import namedtuple
from .bitmask import encode_bitmask

Writer = namedtuple("Writer", ["write", "export"])


def create_string_writer(start_offset=0):
    buffer = bytearray()
    offset = 0

    def write(input_str):
        nonlocal offset
        encoded = input_str.encode('utf-8')
        buffer.extend(encoded)
        length = len(encoded)
        output = (start_offset + offset, length)
        offset += length
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
        buffer.extend(encoded)
        length = len(encoded)
        output = (start_offset + offset, length)
        offset += length
        return output

    def export():
        return buffer

    return Writer(write, export)

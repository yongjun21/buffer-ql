from bitmask import encode_bitmask

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
        return bytes(buffer)

    return {
        "write": write,
        "export": export
    }


def create_bitmask_writer(start_offset=0):
    buffer = bytearray()
    offset = 0

    def write(bitmask, n):
        nonlocal offset
        encoded = encode_bitmask(bitmask, n)
        buffer.extend(encoded)
        length = len(encoded)
        output = (start_offset + offset, length)
        offset += length
        return output

    def export():
        return bytes(buffer)

    return {
        "write": write,
        "export": export
    }

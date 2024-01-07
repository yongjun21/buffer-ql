import struct
from ..helpers.io import read_string


def decode_uint8(dv, offset):
    return dv[offset]


def decode_int8(dv, offset):
    return dv[offset] - 256 if dv[offset] > 127 else dv[offset]


def decode_uint16(dv, offset):
    return int.from_bytes(dv[offset: offset + 2], "little")


def decode_int16(dv, offset):
    return int.from_bytes(dv[offset: offset + 2], "little", signed=True)


def decode_uint32(dv, offset):
    return int.from_bytes(dv[offset: offset + 4], "little")


def decode_int32(dv, offset):
    return int.from_bytes(dv[offset: offset + 4], "little", signed=True)


def decode_float32(dv, offset):
    return struct.unpack("f", dv[offset: offset + 4])[0]


def decode_float64(dv, offset):
    return struct.unpack("d", dv[offset: offset + 8])[0]


def encode_uint8(dv, offset, value, *arg):
    dv[offset] = value


def encode_int8(dv, offset, value, *arg):
    dv[offset] = value + 256 if value < 0 else value


def encode_uint16(dv, offset, value, *arg):
    dv[offset: offset + 2] = value.to_bytes(2, "little")


def encode_int16(dv, offset, value, *arg):
    dv[offset: offset + 2] = value.to_bytes(2, "little", signed=True)


def encode_uint32(dv, offset, value, *arg):
    dv[offset: offset + 4] = value.to_bytes(4, "little")


def encode_int32(dv, offset, value, *arg):
    dv[offset: offset + 4] = value.to_bytes(4, "little", signed=True)


def encode_float32(dv, offset, value, *arg):
    dv[offset: offset + 4] = struct.pack("f", value)


def encode_float64(dv, offset, value, *arg):
    dv[offset: offset + 8] = struct.pack("d", value)


def encode_string(dv, offset, value, string_writer):
    encode_int32(dv, offset, string_writer.write(value))


def decode_vec(size):
    return lambda dv, offset: [decode_float32(dv, offset + 4 * i) for i in range(size)]


def encode_vec(size):
    def _encode_vec(dv, offset, value, *arg):
        for i in range(size):
            encode_float32(dv, offset + 4 * i, value[i])
    return _encode_vec


def is_int(value):
    return isinstance(value, int)


def is_float(value):
    return isinstance(value, float)


def is_string(value):
    return isinstance(value, str)


def is_list_of_floats(value, multiples_of=1):
    return all([is_float(v) for v in value]) and len(value) % multiples_of == 0


class Unflattened:
    def __init__(self, data, size):
        self.data = data
        self.size = size

    def __getitem__(self, index):
        return self.data[index * self.size: (index + 1) * self.size]

    def __len__(self):
        return len(self.data) // self.size


SCHEMA_BASE_PRIMITIVE_TYPES = [
    {
        "name": "Uint8",
        "size": 1,
        "decode": decode_uint8,
        "encode": encode_uint8,
        "check": is_int,
    },
    {
        "name": "Int8",
        "size": 1,
        "decode": decode_int8,
        "encode": encode_int8,
        "check": is_int,
    },
    {
        "name": "Uint16",
        "size": 2,
        "decode": decode_uint16,
        "encode": encode_uint16,
        "check": is_int,
    },
    {
        "name": "Int16",
        "size": 2,
        "decode": decode_int16,
        "encode": encode_int16,
        "check": is_int,
    },
    {
        "name": "Uint32",
        "size": 4,
        "decode": decode_uint32,
        "encode": encode_uint32,
        "check": is_int,
    },
    {
        "name": "Int32",
        "size": 4,
        "decode": decode_int32,
        "encode": encode_int32,
        "check": is_int,
    },
    {
        "name": "Float32",
        "size": 4,
        "decode": decode_float32,
        "encode": encode_float32,
        "check": is_float,
    },
    {
        "name": "Float64",
        "size": 8,
        "decode": decode_float64,
        "encode": encode_float64,
        "check": is_float,
    },
    {
        "name": "String",
        "size": 4,
        "decode": read_string,
        "encode": encode_string,
        "check": is_string,
    },
    {
        "name": "Vector2",
        "size": 8,
        "decode": decode_vec(2),
        "encode": encode_vec(2),
        "check": lambda value: is_list_of_floats(value, 2),
    },
    {
        "name": "Vector3",
        "size": 12,
        "decode": decode_vec(3),
        "encode": encode_vec(3),
        "check": lambda value: is_list_of_floats(value, 3)
    },
    {
        "name": "Vector4",
        "size": 16,
        "decode": decode_vec(4),
        "encode": encode_vec(4),
        "check": lambda value: is_list_of_floats(value, 4),
    },
    {
        "name": "Matrix3",
        "size": 36,
        "decode": decode_vec(9),
        "encode": encode_vec(9),
        "check": lambda value: is_list_of_floats(value, 9),
    },
    {
        "name": "Matrix4",
        "size": 64,
        "decode": decode_vec(16),
        "encode": encode_vec(16),
        "check": lambda value: is_list_of_floats(value, 16),
    },
]

SCHEMA_BASE_COMPOUND_TYPES = [
    {
        "name": "Vector2Array",
        "type": "Array",
        "children": ["Vector2"],
        "transform": lambda arr: Unflattened(arr, 2),
        "check": lambda value: is_list_of_floats(value, 2),
    },
    {
        "name": "Vector3Array",
        "type": "Array",
        "children": ["Vector3"],
        "transform": lambda arr: Unflattened(arr, 3),
        "check": lambda value: is_list_of_floats(value, 3),
    },
    {
        "name": "Vector4Array",
        "type": "Array",
        "children": ["Vector4"],
        "transform": lambda arr: Unflattened(arr, 4),
        "check": lambda value: is_list_of_floats(value, 4),
    },
    {
        "name": "Matrix3Array",
        "type": "Array",
        "children": ["Matrix3"],
        "transform": lambda arr: Unflattened(arr, 9),
        "check": lambda value: is_list_of_floats(value, 9),
    },
    {
        "name": "Matrix4Array",
        "type": "Array",
        "children": ["Matrix4"],
        "transform": lambda arr: Unflattened(arr, 16),
        "check": lambda value: is_list_of_floats(value, 16),
    },
]

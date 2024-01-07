import math
from ..helpers.bitmask import (
    bit_to_index,
    backward_map_indexes,
    one_of_to_index,
    backward_map_one_of
)
from ..helpers.io import create_string_writer, create_bitmask_writer

from ..schema.base import encode_int32


def create_encoder(schema):
    class Writer:
        def __init__(self, type_name, source):
            self.type_name = type_name
            self.current_type = schema[type_name]
            self.current_source = source
            self.current_offset = -1
            self.bitmask = None
            self.branches = []

            if "ref" in self.current_type and not isinstance(self, WriterGroup):
                for i, value in enumerate(source):
                    references[id(value)] = (self, i)

        def is_primitive(self):
            return self.current_type["type"] == "Primitive"

        def is_array(self):
            return self.current_type["type"] == "Array"

        def is_map(self):
            return self.current_type["type"] == "Map"

        def is_optional(self):
            return self.current_type["type"] == "Optional"

        def is_one_of(self):
            return self.current_type["type"] == "OneOf"

        def is_tuple(self):
            return self.current_type["type"] == "Tuple"

        def is_named_tuple(self):
            return self.current_type["type"] == "NamedTuple"

        def is_ref(self):
            return self.current_type["type"] == "Ref"

        def is_link(self):
            return self.current_type["type"] == "Link"

        def is_null(self):
            return len(self.current_source) == 0

        def spawn(self):
            if (
                self.is_primitive()
                or self.is_ref()
                or self.is_link()
                or self.is_null()
            ):
                return []

            current_type = self.current_type
            current_source = self.current_source

            transform = current_type.get("transform")
            if transform:
                current_source = [transform(source)
                                  for source in current_source]

            if self.is_tuple():
                children = current_type["children"]
                next_branches = [Writer(next_type, [
                                        value[i] for value in current_source]) for i, next_type in enumerate(children)]

            elif self.is_named_tuple():
                children = current_type["children"]
                keys = current_type["keys"]
                next_branches = [Writer(next_type, [
                                        value.get(key) for value in current_source]) for key, next_type in zip(keys, children)]

            elif self.is_array():
                next_type = current_type["children"][0]
                writers = [Writer(next_type, next_source)
                           for next_source in current_source]
                next_branches = [WriterGroup(writers)] if len(
                    writers) > 1 else writers

            elif self.is_map():
                next_type = current_type["children"][0]
                key_writers = [Writer("String", list(value.keys()))
                               for value in current_source]
                val_writers = [Writer(next_type, list(value.values()))
                               for value in current_source]
                next_branches = [
                    WriterGroup(key_writers) if len(
                        key_writers) > 1 else key_writers[0],
                    WriterGroup(val_writers) if len(
                        val_writers) > 1 else val_writers[0]
                ]

            elif self.is_optional():
                next_type = current_type["children"][0]
                discriminator = [
                    0 if value is None else 1 for value in current_source]
                bitmask = bit_to_index(discriminator)
                self.bitmask = bitmask
                next_source = [current_source[i]
                               for i in backward_map_indexes(bitmask)]
                next_branches = [Writer(next_type, next_source)]

            elif self.is_one_of():
                children = current_type["children"]

                def discriminate(value):
                    for k in range(len(children)):
                        next_type = schema[children[k]]
                        checker = next_type.get("check", lambda v: True)
                        if checker(value):
                            return k
                    raise ValueError(
                        f'Value {value} does not match any of the OneOf types'
                    )
                discriminator = [discriminate(value)
                                 for value in current_source]
                one_of_index = one_of_to_index(discriminator, len(children))
                self.bitmask = one_of_index
                backward_indexes = backward_map_one_of(
                    one_of_index, len(children))
                next_branches = [
                    Writer(next_type, [current_source[i] for i in indexes])
                    for next_type, indexes in zip(children, backward_indexes)
                ]

            self.branches = next_branches
            return next_branches

        def allocate(self, offset):
            current_type = self.current_type

            if self.is_primitive():
                offset = math.ceil(
                    offset / current_type["size"]) * current_type["size"]

            self.current_offset = offset

            if self.is_null():
                return offset

            if (
                self.is_primitive()
                or self.is_ref()
                or self.is_link()
                or self.is_array()
                or self.is_map()
            ):
                size = current_type["size"]
                return offset + size * len(self.current_source)

            if self.is_tuple() or self.is_named_tuple():
                size = current_type["size"]
                children = current_type["children"]
                return offset + size * len(children)

            if self.is_optional():
                size = current_type["size"]
                return offset + 8 + size * 1

            if self.is_one_of():
                size = current_type["size"]
                children = current_type["children"]
                return offset + 8 + size * len(children)

            raise TypeError(
                f"Allocation not implemented for {current_type['type']}")

        def write(self, dataView, *args):
            if self.is_null():
                return
            current_offset = self.current_offset
            current_type = self.current_type
            current_source = self.current_source
            branches = self.branches
            bitmask = self.bitmask

            if self.is_primitive():
                size, encode = current_type["size"], current_type["encode"]
                for i, value in enumerate(current_source):
                    offset = current_offset + i * size
                    encode(dataView, offset, value, *args)

            elif self.is_tuple() or self.is_named_tuple():
                size = current_type["size"]
                for i, branch in enumerate(branches):
                    offset = current_offset + i * size
                    encode_int32(dataView, offset, branch.current_offset)

            elif self.is_array():
                size = current_type["size"]
                val_writer_group = branches[0]
                if isinstance(val_writer_group, WriterGroup):
                    for i, child in enumerate(val_writer_group.writers):
                        offset = current_offset + i * size
                        encode_int32(dataView, offset, child.current_offset)
                        encode_int32(dataView, offset + 4,
                                     len(child.current_source))
                else:
                    offset = current_offset
                    child = val_writer_group
                    encode_int32(dataView, offset, child.current_offset)
                    encode_int32(dataView, offset + 4,
                                 len(child.current_source))

            elif self.is_map():
                size = current_type["size"]
                key_writer_group, val_writer_group = branches
                if isinstance(key_writer_group, WriterGroup):
                    for i, child in enumerate(key_writer_group.writers):
                        offset = current_offset + i * size
                        encode_int32(dataView, offset, child.current_offset)
                else:
                    offset = current_offset
                    child = key_writer_group
                    encode_int32(dataView, offset, child.current_offset)

                if isinstance(val_writer_group, WriterGroup):
                    for i, child in enumerate(val_writer_group.writers):
                        offset = current_offset + i * size
                        encode_int32(dataView, offset + 4,
                                     child.current_offset)
                        encode_int32(dataView, offset + 8,
                                     len(child.current_source))
                else:
                    offset = current_offset
                    child = val_writer_group
                    encode_int32(dataView, offset + 4, child.current_offset)
                    encode_int32(dataView, offset + 8,
                                 len(child.current_source))

            elif self.is_optional():
                bitmask_writer = args[0]
                val_writer = branches[0]
                bitmask_offset = bitmask_writer.write(
                    bitmask, len(current_source))
                encode_int32(dataView, current_offset, bitmask_offset)
                encode_int32(dataView, current_offset +
                             4, val_writer.current_offset)

            elif self.is_one_of():
                bitmask_writer = args[0]
                bitmask_offset = bitmask_writer.write(
                    bitmask, len(current_source), len(branches))
                encode_int32(dataView, current_offset, bitmask_offset)
                for i, val_writer in enumerate(branches):
                    offset = current_offset + 4 + i * 4
                    encode_int32(dataView, offset, val_writer.current_offset)

            elif self.is_ref():
                size = current_type["size"]
                for i, value in enumerate(current_source):
                    ref = references.get(id(value))
                    if not ref:
                        raise ValueError("Reference object outside of scope")
                    writer, index = ref
                    offset = current_offset + i * size
                    encode_int32(dataView, offset, writer.current_offset)
                    encode_int32(dataView, offset + 4, index)

            elif self.is_link():
                size = current_type["size"]
                for i, _ in enumerate(current_source):
                    offset = current_offset + i * size
                    encode_int32(dataView, offset, -1)
                    encode_int32(dataView, offset + 4, -1)

    class WriterGroup(Writer):
        def __init__(self, writers):
            ref = writers[0]
            super().__init__(ref.type_name, ref.current_source)
            self.writers = writers

        def spawn(self):
            _next_branches = []
            for writer in self.writers:
                children = writer.spawn()
                if not children:
                    continue
                while len(_next_branches) < len(children):
                    _next_branches.append([])
                for i in range(len(children)):
                    _next_branches[i].append(children[i])

            next_branches = [WriterGroup(writers) if len(
                writers) > 1 else writers[0] for writers in _next_branches]
            self.branches = next_branches
            return next_branches

        def allocate(self, offset):
            _offset = offset
            for writer in self.writers:
                _offset = writer.allocate(_offset)
            return _offset

        def write(self, dataView, *args):
            for writer in self.writers:
                writer.write(dataView, *args)

    references = {}

    def encode(data, root_type):
        ordered_writers = {}
        stack = []
        root = Writer(root_type, [data])
        stack.append(root)

        while stack:
            writer = stack.pop()
            type_name = writer.type_name
            ordered_writers[type_name] = ordered_writers.get(type_name, [])
            ordered_writers[type_name].append(writer)
            children = writer.spawn()
            for i in range(len(children) - 1, -1, -1):
                stack.append(children[i])

        offset = 0
        for writers in ordered_writers.values():
            for writer in writers:
                offset = writer.allocate(offset)

        buffer = bytearray(offset)

        string_writer = create_string_writer(offset)
        for writer in ordered_writers["String"]:
            writer.write(buffer, string_writer)
        string_buffer = string_writer.export()

        bitmask_writer = create_bitmask_writer(offset + len(string_buffer))
        for type_name, writers in ordered_writers.items():
            if type_name == "String":
                continue
            for writer in writers:
                writer.write(buffer, bitmask_writer)
        bitmask_buffer = bitmask_writer.export()

        return bytearray(
            buffer + string_buffer + bitmask_buffer
        )
    
    return encode

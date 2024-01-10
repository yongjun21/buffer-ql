from types import SimpleNamespace
from ..helpers.bitmask import (
    encode_bitmask,
    encode_one_of,
    bit_to_index,
    backward_map_indexes,
    one_of_to_index,
    backward_map_one_of
)
from ..helpers.io import size_varint, write_varint, Data_Tape

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
            self.allocated = SimpleNamespace(
                index_size=0, length_size=0, unit_size=0)

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

        def allocate(self, alloc, db):
            if self.is_null():
                return

            current_type = self.current_type
            current_source = self.current_source
            bitmask = self.bitmask
            allocated = self.allocated

            allocated.index_size = alloc.index_size
            allocated.length_size = alloc.length_size
            allocated.unit_size = alloc.unit_size
            alloc.max_length = max(alloc.max_length, len(current_source))

            if self.is_primitive():
                size = current_type["size"]
                if callable(size):
                    for value in current_source:
                        size(value, db)
                    alloc.index_size += len(current_source)
                else:
                    alloc.unit_size += size * len(current_source)
            elif self.is_tuple() or self.is_named_tuple():
                children = current_type["children"]
                alloc.index_size += len(children)
            elif self.is_array():
                alloc.index_size += len(current_source)
                alloc.length_size += len(current_source)
            elif self.is_map():
                alloc.index_size += 2 * len(current_source)
                alloc.length_size += len(current_source)
            elif self.is_ref():
                alloc.index_size += len(current_source)
                alloc.length_size += len(current_source)
            elif self.is_link():
                alloc.unit_size += 8 * len(current_source)
            elif self.is_optional():
                db.put(encode_bitmask(bitmask, len(current_source)), id(bitmask))
                alloc.index_size += 2
            elif self.is_one_of():
                children = current_type["children"]
                db.put(encode_one_of(bitmask, len(
                    current_source), len(children)), id(bitmask))
                alloc.index_size += len(children) + 1
            else:
                raise TypeError(
                    f"Allocation not implemented for {current_type['type']}")

        def position(self, n, m, adj):
            alloc = self.allocated
            self.current_offset = alloc.index_size * n + \
                alloc.length_size * m + alloc.unit_size + adj

        def write(self, dataView, db, index_size, length_size):
            if self.is_null():
                return
            current_offset = self.current_offset
            current_type = self.current_type
            current_source = self.current_source
            branches = self.branches
            bitmask = self.bitmask

            if self.is_primitive():
                _size, encode = current_type["size"], current_type["encode"]
                size = _size if type(_size) == int else index_size
                for i, value in enumerate(current_source):
                    offset = current_offset + i * size
                    encode(dataView, offset, value, db)

            elif self.is_tuple() or self.is_named_tuple():
                for i, branch in enumerate(branches):
                    offset = current_offset + i * index_size
                    write_varint(dataView, offset, branch.current_offset, True)

            elif self.is_array():
                val_writer_group = branches[0]
                if isinstance(val_writer_group, WriterGroup):
                    for i, child in enumerate(val_writer_group.writers):
                        offset = current_offset + i * \
                            (index_size + length_size)
                        write_varint(dataView, offset,
                                     child.current_offset, True)
                        write_varint(dataView, offset + index_size,
                                     len(child.current_source))
                else:
                    offset = current_offset
                    child = val_writer_group
                    write_varint(dataView, offset, child.current_offset, True)
                    write_varint(dataView, offset + index_size,
                                 len(child.current_source))

            elif self.is_map():
                key_writer_group, val_writer_group = branches
                if isinstance(key_writer_group, WriterGroup):
                    for i, child in enumerate(key_writer_group.writers):
                        offset = current_offset + i * \
                            (2 * index_size + length_size)
                        write_varint(dataView, offset,
                                     child.current_offset, True)
                else:
                    offset = current_offset
                    child = key_writer_group
                    write_varint(dataView, offset, child.current_offset, True)

                if isinstance(val_writer_group, WriterGroup):
                    for i, child in enumerate(val_writer_group.writers):
                        offset = current_offset + i * \
                            (2 * index_size + length_size)
                        write_varint(dataView, offset + index_size,
                                     child.current_offset, True)
                        write_varint(dataView, offset + 2 * index_size,
                                     len(child.current_source))
                else:
                    offset = current_offset
                    child = val_writer_group
                    write_varint(dataView, offset + index_size,
                                 child.current_offset, True)
                    write_varint(dataView, offset + 2 * index_size,
                                 len(child.current_source))

            elif self.is_optional():
                val_writer = branches[0]
                Data_Tape.write(dataView, current_offset, id(bitmask), db)
                write_varint(dataView, current_offset +
                             index_size, val_writer.current_offset, True)

            elif self.is_one_of():
                Data_Tape.write(dataView, current_offset, id(bitmask), db)
                for i, val_writer in enumerate(branches):
                    offset = current_offset + index_size * (i + 1)
                    write_varint(dataView, offset,
                                 val_writer.current_offset, True)

            elif self.is_ref():
                for i, value in enumerate(current_source):
                    ref = references.get(id(value))
                    if not ref:
                        raise ValueError("Reference object outside of scope")
                    writer, index = ref
                    offset = current_offset + i * (index_size + length_size)
                    write_varint(dataView, offset, writer.current_offset, True)
                    write_varint(dataView, offset + index_size, index, True)

            elif self.is_link():
                for i, _ in enumerate(current_source):
                    offset = current_offset + i * 8
                    encode_int32(dataView, offset, -1)
                    encode_int32(dataView, offset + 4, -1)

    class WriterGroup(Writer):
        def __init__(self, writers):
            ref = writers[0]
            super().__init__(ref.type_name, ref.current_source)
            self.writers = writers
            self.allocated = ref.allocated

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

        def allocate(self, alloc, db):
            for writer in self.writers:
                writer.allocate(alloc, db)

        def position(self, n, m, adj):
            for writer in self.writers:
                writer.position(n, m, adj)

        def write(self, dataView, db, index_size, length_size):
            for writer in self.writers:
                writer.write(dataView, db, index_size, length_size)

    references = {}

    def encode(data, root_type):
        references.clear()
        grouped_writers = {}
        stack = []
        root = Writer(root_type, [data])
        stack.append(root)

        while stack:
            writer = stack.pop()
            type_name = writer.type_name
            grouped_writers[type_name] = grouped_writers.get(type_name, [])
            grouped_writers[type_name].append(writer)
            children = writer.spawn()
            for i in range(len(children) - 1, -1, -1):
                stack.append(children[i])

        def sort_key(writers):
            writer_type = writers[0].current_type
            size = writer_type.get("size", None)
            return size if type(size) == int else 0
        sorted_writers = sorted(grouped_writers.values(),
                                key=sort_key)

        alloc = SimpleNamespace(index_size=0, length_size=0,
                                unit_size=1, max_length=0)
        db = Data_Tape()

        for writers in sorted_writers:
            for writer in writers:
                writer.allocate(alloc, db)

        paddings = set()
        for writers in sorted_writers:
            writer_type = writers[0].current_type
            if type(writer_type.get("size", None)) == int:
                paddings.add(writer_type["size"] - 1)

        exported_db = db.export()
        n, m = optimizeAlloc(alloc, paddings, len(exported_db))

        sum_padding = 0
        for writers in sorted_writers:
            writer_type = writers[0].current_type
            if type(writer_type.get("size", None)) == int:
                _alloc = writers[0].allocated
                _offset = _alloc.index_size * n + _alloc.length_size * \
                    m + _alloc.unit_size + sum_padding
                if _offset % writer_type["size"] != 0:
                    sum_padding += writer_type["size"] - \
                        (_offset % writer_type["size"])
            for writer in writers:
                writer.position(n, m, sum_padding)

        offset = alloc.index_size * n + alloc.length_size * \
            m + alloc.unit_size + sum_padding
        buffer = bytearray(offset)
        db.shift(offset)

        buffer[0] = (n << 4) | m
        for writers in sorted_writers:
            for writer in writers:
                writer.write(buffer, db, n, m)

        return bytearray(buffer + exported_db)

    return encode


def optimizeAlloc(alloc, paddings, additional):
    m = size_varint(alloc.max_length)
    sum_padding = sum(paddings)
    for n in range(1, 5):
        total_size = alloc.index_size * n + alloc.length_size * \
            m + alloc.unit_size + sum_padding + additional
        if size_varint(total_size, True) <= n:
            return [n, m]
    raise IndexError("Index overflow, split data into smaller chunks")

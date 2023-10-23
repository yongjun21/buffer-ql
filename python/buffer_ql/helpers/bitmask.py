def decode_bitmask(encoded, max_index):
    class Iter:
        def __iter__(self):
            n = max_index + 1
            depth = (n - 1).bit_length()
            reader = read_bit(encoded)
            stack = []
            stack.append(depth)

            curr_index = 0

            while stack:
                if curr_index >= n:
                    break

                next_value = reader()
                level = stack.pop()

                if level == 0:
                    if next_value:
                        yield curr_index
                    curr_index += 1
                elif next_value:
                    stack.extend([level - 1, level - 1])
                else:
                    curr_index += 1 << level
    return Iter()


def encode_bitmask(iterable, max_index):
    n = max_index + 1
    input = iter(iterable)
    output = bytearray()
    writer = write_bit(output)

    depth = (n - 1).bit_length()
    stack = []
    stack.append(depth)

    curr_index = 0
    next_value = next(input, None)

    while stack:
        if curr_index >= n or next_value is None:
            break

        level = stack.pop()
        leaf_count = 1 << level

        if level == 0:
            if next_value == curr_index:
                writer(1)
                next_value = next(input, None)
            else:
                writer(0)
            curr_index += 1
        elif curr_index + leaf_count > next_value:
            writer(1)
            stack.extend([level - 1, level - 1])
        else:
            writer(0)
            curr_index += leaf_count

    return bytes(output)


def decode_one_of(encoded, max_index, no_of_class):
    n = max_index * no_of_class + no_of_class - 1

    class Iter:
        def __iter__(self):
            return restructure_one_of_indexes(decode_bitmask(encoded, n), no_of_class)
    return Iter()


def encode_one_of(iterable, max_index, no_of_class):
    n = max_index * no_of_class + no_of_class - 1
    return encode_bitmask(normalize_one_of_indexes(iterable, no_of_class), n)


def normalize_one_of_indexes(iterable, no_of_class):
    curr = -1
    for i in iterable:
        if curr < 0:
            curr = i
            continue
        yield i * no_of_class + curr
        curr = -1


def restructure_one_of_indexes(iterable, no_of_class):
    for i in iterable:
        yield i % no_of_class
        yield i // no_of_class


def bit_to_index(iterable):
    class Iter:
        def __iter__(self):
            index = 0
            curr = 0
            for b in iterable:
                if b != curr:
                    yield index
                    curr = b
                index += 1
            yield index
    return Iter()


def one_of_to_index(iterable):
    class Iter:
        def __iter__(self):
            index = 0
            curr = -1
            for k in iterable:
                if k != curr:
                    if index > 0:
                        yield index
                    yield k
                    curr = k
                index += 1
            if index > 0:
                yield index
    return Iter()


def index_to_bit(decoded_bitmask):
    class Iter:
        def __iter__(self):
            index = 0
            curr = 0
            for i in decoded_bitmask:
                while index < i:
                    yield curr
                    index += 1
                curr = 1 - curr
    return Iter()


def index_to_one_of(decoded_one_of):
    class Iter:
        def __iter__(self):
            index = 0
            curr = -1
            for i in decoded_one_of:
                if curr < 0:
                    curr = i
                    continue
                while index < i:
                    yield curr
                    index += 1
                curr = -1
    return Iter()


def forward_map_indexes(decoded_bitmask, equals=1):
    class Iter:
        def __iter__(self):
            ones = 0
            index = 0
            curr = 1 - equals

            for i in decoded_bitmask:
                if curr:
                    while index < i:
                        yield ones
                        ones += 1
                        index += 1
                else:
                    while index < i:
                        yield -1
                        index += 1
                curr = 1 - curr
    return Iter()


def backward_map_indexes(decoded_bitmask, equals=1):
    class Iter:
        def __iter__(self):
            index = 0
            curr = 1 - equals
            for i in decoded_bitmask:
                if curr:
                    while index < i:
                        yield index
                        index += 1
                else:
                    index = i
                curr = 1 - curr
    return Iter()


def forward_map_single_index(index, decoded_bitmask, equals=1):
    if index < 0:
        return -1
    zeros = 0
    ones = 0
    curr = 1 - equals
    for i in decoded_bitmask:
        if curr:
            ones = i - zeros
        else:
            zeros = i - ones
        if index < i:
            break
        curr = 1 - curr
    return index - zeros if curr else -1


def backward_map_single_index(index, decoded_bitmask, equals=1):
    zeros = 0
    ones = 0
    curr = 1 - equals
    for i in decoded_bitmask:
        if curr:
            ones = i - zeros
            if index < ones:
                break
        else:
            zeros = i - ones
        curr = 1 - curr
    return index + zeros if curr else -1


def chain_forward_indexes(curr_mapped, next_mapped):
    class Iter:
        def __iter__(self):
            next_iter = iter(next_mapped)
            for i in curr_mapped:
                if i < 0:
                    yield -1
                else:
                    next_value = next(next_iter, None)
                    yield -1 if next_value is None else next_value
    return Iter()


def chain_backward_indexes(curr_mapped, next_mapped):
    class Iter:
        def __iter__(self):
            curr_iter = iter(curr_mapped)
            index = 0
            next_value = next(curr_iter, None)

            for i in next_mapped:
                while index < i:
                    next_value = next(curr_iter, None)
                    index += 1
                if next_value is None:
                    return
                yield next_value
    return Iter()


def forward_map_one_of(decoded_one_of, no_of_class):
    class Iter:
        def __init__(self, k):
            self.k = k

        def __iter__(self):
            ones = 0
            index = 0
            curr = -1
            for i in decoded_one_of:
                if curr < 0:
                    curr = i
                    continue
                if curr == self.k:
                    while index < i:
                        yield ones
                        ones += 1
                        index += 1
                else:
                    while index < i:
                        yield -1
                        index += 1
                curr = -1
    return [Iter(k) for k in range(no_of_class)]


def backward_map_one_of(decoded_one_of, no_of_class):
    class Iter:
        def __init__(self, k):
            self.k = k

        def __iter__(self):
            index = 0
            curr = -1
            for i in decoded_one_of:
                if curr < 0:
                    curr = i
                    continue
                if curr == self.k:
                    while index < i:
                        yield index
                        index += 1
                else:
                    index = i
                curr = -1
    return [Iter(k) for k in range(no_of_class)]


def forward_map_single_one_of(index, decoded_one_of, no_of_class):
    if index < 0:
        return [0, -1]

    zeros = [0] * no_of_class
    ones = [0] * no_of_class
    curr = -1

    for i in decoded_one_of:
        if curr < 0:
            curr = i
            continue
        for k in range(no_of_class):
            if curr == k:
                ones[k] = i - zeros[k]
            else:
                zeros[k] = i - ones[k]
        if index < i:
            break
        curr = -1

    return [curr, index - zeros[curr]]


def backward_map_single_one_of(index, decoded_one_of, group):
    zeros = 0
    ones = 0
    curr = -1

    for i in decoded_one_of:
        if curr < 0:
            curr = i
            continue
        if curr == group:
            ones = i - zeros
            if index < ones:
                break
        else:
            zeros = i - ones
        curr = -1
    return index + zeros if curr == group else -1


def diff_indexes(curr_indexes, next_indexes):
    class Iter:
        def __iter__(self):
            next_iter = iter(next_indexes)
            next_index = next(next_iter, None)

            for curr_index in curr_indexes:
                while next_index is not None and next_index < curr_index:
                    yield next_index
                    next_index = next(next_iter, None)

                if next_index is None or next_index > curr_index:
                    yield curr_index
                else:
                    next_index = next(next_iter, None)

            while next_index is not None:
                yield next_index
                next_index = next(next_iter, None)

    return Iter()


def diff_one_of_indexes(curr_one_of, next_one_of, no_of_class):
    class Iter:
        def __iter__(self):
            return restructure_one_of_indexes(
                diff_indexes(
                    normalize_one_of_indexes(curr_one_of, no_of_class),
                    normalize_one_of_indexes(next_one_of, no_of_class)
                ),
                no_of_class
            )
    return Iter()


def read_bit(arr):
    index = 0
    position = 0

    def reader():
        nonlocal index, position
        if index >= len(arr):
            return 0
        value = arr[index]
        mask = 1 << position
        position += 1
        if position >= 8:
            index += 1
            position = 0
        return 1 if (value & mask) else 0

    return reader


def write_bit(arr):
    index = 0
    position = 0

    def writer(v):
        nonlocal index, position
        if index >= len(arr):
            arr.append(0)
        mask = 1 << position
        arr[index] += mask * v
        position += 1
        if position >= 8:
            index += 1
            position = 0

    return writer

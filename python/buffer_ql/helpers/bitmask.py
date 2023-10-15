import heapq

def decode_bitmask(encoded, n):
    class Iter:        
        def __iter__(self):
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


def encode_bitmask(iterable, n):
    input_iter = iter(iterable)
    output = bytearray()
    depth = (n - 1).bit_length()
    writer = write_bit(output)
    stack = []
    stack.append(depth)

    curr_index = 0
    next_value = None

    next_value = next(input_iter, None)
    if next_value is None:
        return bytes([0])

    while stack:
        if curr_index >= n:
            break

        level = stack.pop()
        leaf_count = 1 << level

        if next_value is None:
            curr_index += leaf_count
            continue

        if level == 0:
            if next_value == curr_index:
                writer(1)
                next_value = next(input_iter, None)
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
    return Iter()


def one_of_to_index(iterable, no_of_class):
    class Iter:
        def __init__(self, k):
            self.k = k

        def __iter__(self):
            index = 0
            curr = -1
            for n in iterable:
                if n == self.k and n != curr:
                    yield index
                curr = n
                index += 1

    return [Iter(k) for k in range(no_of_class)]


def index_to_bit(n, decoded_bitmask):
    class Iter:
        def __iter__(self):
            index = 0
            curr = 0
            for i in decoded_bitmask:
                while index < i:
                    yield curr
                    index += 1
                curr = 1 - curr

            while index < n:
                yield curr
                index += 1

    return Iter()

def index_to_one_of(n, *decoded_bitmasks):
    class Iter:
        def __iter__(self):
            index = 0
            for curr, until in one_of_loop(n, decoded_bitmasks):
                while index < until:
                    yield curr
                    index += 1

    return Iter()


def forward_map_indexes(n, decoded_bitmask, equals=1):
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

            if curr:
                while index < n:
                    yield ones
                    ones += 1
                    index += 1
            else:
                while index < n:
                    yield -1
                    index += 1

    return Iter()


def backward_map_indexes(n, decoded_bitmask, equals=1):
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

            if curr:
                while index < n:
                    yield index
                    index += 1

    return Iter()


def forward_map_single_index(decoded_bitmask, index, equals=1):
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


def backward_map_single_index(decoded_bitmask, index, equals=1):
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


def forward_map_one_of(n, *decoded_bitmasks):
    class Iter:
        def __init__(self, k):
            self.k = k

        def __iter__(self):
            ones = 0
            index = 0
            for curr, until in one_of_loop(n, decoded_bitmasks):
                if curr == self.k:
                    while index < until:
                        yield ones
                        ones += 1
                        index += 1
                else:
                    while index < until:
                        yield -1
                        index += 1

    return [Iter(k) for k in range(len(decoded_bitmasks))]


def backward_map_one_of(n, *decoded_bitmasks):
    class Iter:
        def __init__(self, k):
            self.k = k

        def __iter__(self):
            index = 0
            for curr, until in one_of_loop(n, decoded_bitmasks):
                if curr == self.k:
                    while index < until:
                        yield index
                        index += 1
                else:
                    index = until

    return [Iter(k) for k in range(len(decoded_bitmasks))]


def forward_map_single_one_of(index, *decoded_bitmasks):
    if index < 0:
        return [0, -1]

    k_max = len(decoded_bitmasks)
    zeros = [0] * k_max
    ones = [0] * k_max
    last_curr = -1

    for curr, until in one_of_loop(1 << 32, decoded_bitmasks):
        last_curr = curr
        for k in range(k_max):
            if curr == k:
                ones[k] = until - zeros[k]
            else:
                zeros[k] = until - ones[k]
        if index < until:
            break

    return [last_curr, index - zeros[last_curr]]


def backward_map_single_one_of(group, index, *decoded_bitmasks):
    zeros = 0
    ones = 0
    is_curr = False
    for curr, until in one_of_loop(1 << 32, decoded_bitmasks):
        is_curr = curr == group
        if is_curr:
            ones = until - zeros
            if index < ones:
                break
        else:
            zeros = until - ones
    return index + zeros if is_curr else -1


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

    return Iter()


def apply_index_diff(curr_indexes, diff_indexes):
    class Iter:
        def __iter__(self):
            diff_iter = iter(diff_indexes)
            diff_index = next(diff_iter, None)

            for curr_index in curr_indexes:
                while diff_index is not None and diff_index < curr_index:
                    yield diff_index
                    diff_index = next(diff_iter, None)

                if diff_index is None or diff_index > curr_index:
                    yield curr_index
                else:
                    diff_index = next(diff_iter, None)

    return Iter()


def one_of_loop(n, decoded_bitmasks):
    iters = [iter(decoded_bitmask) for decoded_bitmask in decoded_bitmasks]

    min_heap = []
    for k, iterator in enumerate(iters):
        i = next(iterator, n)
        min_heap.append((i, k))
    heapq.heapify(min_heap)

    _, curr = heapq.heappop(min_heap)
    next_index = next(iters[curr], n)
    heapq.heappush(min_heap, (next_index, curr))

    while True:
        min_index, min_k = heapq.heappop(min_heap)
        if min_index == n:
            break

        next_index = next(iters[min_k], n)
        heapq.heappush(min_heap, (next_index, min_k))

        yield (curr, min_index)
        curr = min_k
       
    yield (curr, n)


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
    n = 0
    index = 0
    position = 0

    def writer(v):
        nonlocal n, index, position
        if index >= len(arr):
            arr.append(0)
        mask = 1 << position
        arr[index] += mask * v
        n += 1
        position += 1
        if position >= 8:
            index += 1
            position = 0
        return n

    return writer


def always_zero():
    while True:
        yield 0

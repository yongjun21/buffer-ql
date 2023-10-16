from buffer_ql.helpers.bitmask import (
    encode_bitmask,
    decode_bitmask,
    index_to_bit,
    index_to_one_of,
    one_of_to_index,
    forward_map_indexes,
    backward_map_indexes,
    forward_map_single_index,
    backward_map_single_index,
    chain_forward_indexes,
    chain_backward_indexes,
    forward_map_one_of,
    backward_map_one_of,
    forward_map_single_one_of,
    backward_map_single_one_of,
    diff_indexes,
)

def test_bitmask():
    test = [3, 6, 7, 21, 28]
    encoded = encode_bitmask(test, 256)
    print(list(encoded))

    decoded = decode_bitmask(encoded, 256)
    print(list(decoded))

    print(list(index_to_bit(32, decoded)))


    forward_indexes = list(forward_map_indexes(32, decoded))
    backward_indexes = list(backward_map_indexes(32, decoded))

    print(forward_indexes)
    print(backward_indexes)

    chain_forward_result = chain_forward_indexes(forward_indexes, forward_indexes)
    print(list(chain_forward_result))

    chain_backward_result = chain_backward_indexes(backward_indexes, backward_indexes)
    print(list(chain_backward_result))

    print([forward_map_single_index(decoded, i) for i, _ in enumerate(forward_indexes)])
    print([backward_map_single_index(decoded, i) for i, _ in enumerate(backward_indexes)])

    test2 = [
        0, 0, 0, 1, 1, 1, 0, 2, 2,
        2, 1, 2, 2, 2, 2, 2, 2, 2,
        2, 2, 2, 0, 0, 0, 0, 0, 0,
        0, 2, 2, 2, 2
    ]

    one_of_bitmasks = one_of_to_index(test2, 3)
    print([list(iter) for iter in one_of_bitmasks])
    discriminator = index_to_one_of(32, *one_of_bitmasks)
    forward_one_of = forward_map_one_of(32, *one_of_bitmasks)
    backward_one_of = backward_map_one_of(32, *one_of_bitmasks)

    print(list(discriminator))
    print([list(iter) for iter in forward_one_of])
    print([list(iter) for iter in backward_one_of])

    print([
        backward_map_single_one_of(k, i, *one_of_bitmasks)
        for (k, i) in (forward_map_single_one_of(i, *one_of_bitmasks)
        for i in range(32))
    ])

    test3 = [1, 2, 3, 4, 5, 6, 7, 8]
    diff = diff_indexes(test, test3)
    diff_applied = diff_indexes(test, diff)
    diff_unapplied = diff_indexes(test3, diff)
    print(list(diff))
    print(list(diff_applied))
    print(list(diff_unapplied))


test_bitmask()

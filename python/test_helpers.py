from buffer_ql.helpers.bitmask import (
    encode_bitmask,
    decode_bitmask,
    encode_one_of,
    decode_one_of,
    bit_to_index,
    one_of_to_index,
    index_to_bit,
    index_to_one_of,
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
    test = [
        0, 0, 0, 1, 1, 1, 0, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 0 ,0 ,0,
        0, 0, 0, 0, 1, 1, 1, 1
    ]
    encoded = encode_bitmask(bit_to_index(test), 255)
    decoded = decode_bitmask(encoded, 255)
    print(encoded)
    print(list(decoded))
    print(list(index_to_bit(decoded)))


    forward_indexes = forward_map_indexes(decoded)
    backward_indexes = backward_map_indexes(decoded)
    chained_forward = chain_forward_indexes(forward_indexes, forward_indexes)
    chained_backward = chain_backward_indexes(backward_indexes, backward_indexes)
    print(list(forward_indexes))
    print(list(backward_indexes))
    print(list(chained_forward))
    print(list(chained_backward))

    print([forward_map_single_index(i, decoded) for i, _ in enumerate(forward_indexes)])
    print([backward_map_single_index(i, decoded) for i, _ in enumerate(backward_indexes)])

    test2 = [
        0, 0, 0, 1, 1, 1, 0, 2,
        2, 2, 1, 2, 2, 2, 2, 2,
        2, 2, 2, 2, 2, 0, 0, 0,
        0, 0, 0, 0, 2, 2, 2, 2
    ]
    encoded_one_of = encode_one_of(one_of_to_index(test2), 32, 3)
    decoded_one_of = decode_one_of(encoded_one_of, 32, 3)
    print(list(decoded_one_of))

    discriminator = index_to_one_of(decoded_one_of)
    forward_one_of = forward_map_one_of(decoded_one_of, 3)
    backward_one_of = backward_map_one_of(decoded_one_of, 3)
    print(list(discriminator))
    print([list(iter) for iter in forward_one_of])
    print([list(iter) for iter in backward_one_of])

    print([
        backward_map_single_one_of(i, decoded_one_of, k)
        for (k, i) in (forward_map_single_one_of(i, decoded_one_of, 3)
        for i in range(32))
    ])

    test3 = [1, 2, 3, 4, 5, 6, 7, 8]
    diff = diff_indexes(decoded, test3)
    diff_applied = diff_indexes(decoded, diff)
    diff_unapplied = diff_indexes(test3, diff)
    print(list(diff))
    print(list(diff_applied))
    print(list(diff_unapplied))


test_bitmask()

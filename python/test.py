from helpers.bitmask import (
    encode_bitmask,
    decode_bitmask,
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
    backward_map_single_one_of
)

def test_bitmask():
    test = [3, 6, 7, 21, 28]
    encoded = encode_bitmask(test, 256)
    print(encoded)

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

    discriminator = list(index_to_one_of(32, decoded, decoded))
    forward_one_of = list(forward_map_one_of(32, decoded, decoded))
    backward_one_of = list(backward_map_one_of(32, decoded, decoded))

    print(discriminator)
    print([list(iter) for iter in forward_one_of])
    print([list(iter) for iter in backward_one_of])

    print([
        backward_map_single_one_of(k, i, decoded, decoded)
        for (k, i) in (forward_map_single_one_of(i, decoded, decoded)
        for i in range(32))
    ])

test_bitmask()

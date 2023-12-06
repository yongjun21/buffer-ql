def validate_transitions(states, predicate):
    for i in range(1, len(states)):
        if not predicate(states[i - 1], states[i]):
            return False
    return True

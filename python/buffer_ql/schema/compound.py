import re

from ..helpers.state_machine import validate_transitions

VALID_TRANSITIONS = {
    '<': ['<', '_'],
    '_': ['>', ','],
    ',': ['<', '_'],
    '>': ['>', ',']
}


def parse_expression(label, exp):
    parsed = {}
    tokenized = []
    pattern = re.compile(
        r"((Array|Map|Optional|OneOf|Ref|Link)<)|([A-Za-z0-9_/]+)|(,|>)")
    matched = pattern.match(exp)
    while matched:
        if matched.group(1):
            tokenized.append(('<', matched.group(2)))
        elif matched.group(3):
            tokenized.append(('_', matched.group(3)))
        else:
            tokenized.append((matched.group(4), ''))
        matched = pattern.match(exp, pos=matched.end())

    if not validate_expression([action for action, _ in tokenized]):
        raise TypeError(f"Invalid schema expression: {exp}")

    if len(tokenized) == 1:
        parsed[label] = {'type': 'Alias', 'children': [tokenized[0][1]]}
        return parsed

    stack = []
    curr = None
    for action, token in tokenized:
        if action == '<':
            record = {'type': token, 'children': []}
            next_entry = {'label': label, 'record': record}
            label += f"({token})"
            parsed[next_entry['label']] = next_entry['record']
            if curr:
                stack.append(curr)
            curr = next_entry
        elif action == '_':
            if curr:
                curr['record']['children'].append(token)
        elif action == '>':
            if len(stack) > 0:
                top = stack.pop()
                if curr:
                    top['record']['children'].append(curr['label'])
                curr = top
            else:
                curr = None
    return parsed


def validate_expression(state_transition):
    transitions_valid = validate_transitions(
        [','] + state_transition + [','],
        lambda input, output: output in VALID_TRANSITIONS[input]
    )
    if not transitions_valid:
        return False

    level = 0
    for action in state_transition:
        if action == '<':
            level += 1
        elif action == '>':
            level -= 1
        elif action == ',':
            if level < 1:
                return False

    return level == 0

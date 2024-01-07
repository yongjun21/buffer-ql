from .base import SCHEMA_BASE_PRIMITIVE_TYPES, SCHEMA_BASE_COMPOUND_TYPES
from .compound import parse_expression


def extend_schema(base_types, types, transforms={}, checks={}):
    schema = {}

    for record in SCHEMA_BASE_PRIMITIVE_TYPES:
        schema[record["name"]] = {**record, "type": "Primitive"}

    for record in SCHEMA_BASE_COMPOUND_TYPES:
        schema[record["name"]] = record

    for label, record in base_types.items():
        schema[label] = {**record, "type": "Primitive"}

    def add_records(records):
        for _label, _value in records.items():
            schema[_label] = {
                **_value,
                "transform": transforms.get(_label),
                "check": checks.get(_label)
            }

    for label, value in types.items():
        if isinstance(value, str):
            add_records(parse_expression(label, value))
        elif isinstance(value, list):
            record = {
                "type": "Tuple",
                "children": [],
            }
            add_records({label: record})
            for i, exp in enumerate(value):
                _label = f'{label}[{i}]'
                record["children"].append(_label)
                add_records(parse_expression(_label, exp))
        else:
            record = {
                "type": "NamedTuple",
                "children": [],
                "keys": [],
                "indexes": {},
            }
            add_records({label: record})
            for key, exp in value.items():
                _label = f'{label}.{key}'
                record["children"].append(_label)
                record["keys"].append(key)
                record["indexes"][key] = len(record["keys"]) - 1
                add_records(parse_expression(_label, exp))

    validate_schema(schema)
    forward_alias(schema)
    mark_refs(schema)
    return schema


def validate_schema(schema):
    for label, record in schema.items():
        if record["type"] != "Primitive" and record["type"] != "Link":
            for child in record["children"]:
                if child not in schema:
                    raise TypeError(
                        f'Missing type definition {child} for {label}')

        modifier_types = ["Array", "Map", "Optional", "Ref", "Link"]
        if record["type"] in modifier_types:
            if len(record["children"]) != 1:
                raise TypeError(
                    f'Modifier type {record["type"]} should reference only a single child')

        if record["type"] == "OneOf":
            if len(record["children"]) < 2:
                raise TypeError(
                    "Modifier type OneOf should reference at least two children")
            if len(record["children"]) > len(set(record["children"])):
                raise TypeError(
                    "Modifier type OneOf should not reference duplicate children")
            for child in record["children"]:
                if "check" not in schema[child] or not schema[child]["check"]:
                    raise TypeError(
                        f'Type {child} is present as an OneOf option but missing a check function')

        if record["type"] == "Optional":
            if schema[record["children"][0]]["type"] == "Optional":
                raise TypeError(
                    "Modifier type Optional should not reference another Optional")

        if record["type"] == "Ref":
            allowed_types = ["Tuple", "NamedTuple", "Array", "Map"]
            if schema[record["children"][0]]["type"] not in allowed_types:
                raise TypeError(
                    "Modifier type Ref should be used only on Tuple, NamedTuple, Array or Map")

        if record["type"] == "Link":
            schema_name, *rest = record["children"][0].split("/")
            type_name = "/".join(rest)
            if schema_name == "" or type_name == "":
                raise TypeError(
                    f'Invalid Link {record["children"][0]}. Use the pattern Link<SchemaKey/TypeName> to reference a type from another schema')


def forward_alias(schema, replaced=0):
    if replaced > len(schema):
        raise TypeError("Circular alias reference detected")

    count = 0
    for label, record in schema.items():
        if record["type"] == "Alias":
            schema[label] = schema[record["children"][0]]
            count += 1

    if count > 0:
        forward_alias(schema, replaced + count)


def mark_refs(schema):
    for _, record in schema.items():
        if record["type"] == "Ref":
            schema[record["children"][0]]["ref"] = True

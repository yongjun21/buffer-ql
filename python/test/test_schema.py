from buffer_ql import extend_schema

def decode_source_type_enum(dv, offset):
    return [ "Lidar",  "Camera"][dv[offset]]

def encode_source_type_enum(dv, offset, value, *arg):
    dv[offset] = [ "Lidar",  "Camera"].index(value)

SCHEMA = extend_schema(
    {
        "SourceTypeEnum": {
            "size": 1,
            "decode": decode_source_type_enum,
            "encode": encode_source_type_enum,
        },
    },
    {
        "#": {
            "trackedEntities": "Array<TrackedEntity>",
            "trackedEntitiesOfInterest": "Map<TrackedEntityRef>",
        },
        "TrackedEntity": {
            "id": "Int32",
            "class": "Uint8",
            "pose": "Pose",
            "velocity": "Optional<Vector3>",
            "source": "TrackedEntitySource",
            "waypoints": "Optional<Array<TrackedEntityWayPoint>>"
        },
        "TrackedEntityWayPoint": {
            "timestamp":  "Int32",
            "pose":  "Pose",
            "probability":  "Optional<Float32>",
        },
        "Pose": {
            "position":  "Vector3",
            "rotation":  "Vector3",
            "size":  "Vector3"
        },
        "TrackedEntitySource": [
            "SourceTypeEnum",
            "OneOf<String,Int32>",
            "Optional<String>"
        ],
        "TrackedEntityRef":  "Ref<TrackedEntity>",
    }
)

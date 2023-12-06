from pathlib import Path
import json

from buffer_ql import encode_with_schema

from test_schema import SCHEMA

curr_dir = Path(__file__).parent
data_path = curr_dir / ".." / "test" / "dummyData.json"

with open(data_path) as f:
    dummy_data = json.loads(f.read())

tracked_entities = dummy_data["trackedEntities"]
tracked_entities_of_interest = dummy_data["trackedEntitiesOfInterest"]

for key in tracked_entities_of_interest.keys():
    tracked_entities_of_interest[key] = tracked_entities[tracked_entities_of_interest[key]]

encoded = encode_with_schema(dummy_data, SCHEMA, "#")

with open(curr_dir / ".." / "test" / "encodedPY.bin", "wb") as f:
    f.write(encoded)

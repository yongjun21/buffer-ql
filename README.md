# Data tooling optimized for visualization

## Key components
1. **Data schema** representation that is simple to use yet giving user enough flexibility to support fairly complicated data shape
2. **Data container** backed by a custom highly efficient buffer format
3. **Data reader** to extract values from data container efficiently without the need to fully decode the data content
4. **Custom data structure** for manipulating data with a simple API resembling that of JS arrays and objects
5. **Data encoder** to write data into data container according to user provided data schema

## Main features
- Data encoded into buffer format for maximum efficiency
- No decode / no unpack step
  - Data container / data reader pairing and the use of a data schema meant values can be surgically and reliably extracted from buffer as and when needed
  - Avoid generating many JS objects since skipping full unpacking
- Introduce a powerful data handling tool that is simple enough to use yet abstract away many complex data operations and optimizations
  - "Lazy" by default
  - Data operation starts only in the final consumption step
  - Process data in columns as opposed to the row style that is more common in JavaScript
- Simple yet powerful language for data schema representation
  - Supports all common data types:
    - Primitives
    - Arrays
    - Objects (in the form of tuple or named tuple)
    - Key-value maps
    - Optional fields
    - OneOf fields
  - Supports unlimited nesting of data types
  - Supports circular or self referencing data structures. Eg.
    - Linked list
    - Directed graphs
- Highly performant in read-only operation

## Motivations
- We started from searching for any efficient data format for streaming large quantity of semi-structured data over the web.
- JSON is a very flexible format for storing unstructured data but isn't efficient as numericals are encoded as UTF8 strings and additional space are wasted on specifying structures (such brackets for objects and repeated field names)
- It is clear that a schema backed format that encodes data into a buffer form is the most econmical way to transfer data (primitives encoded using the least number of bytes, no wastage on encoding structures).
- Google's [Protocol Buffer](https://github.com/protocolbuffers/protobuf) is a good solution in this space. However we will like to push the idea of a schema backed data format a bit further to solve some of the other problems we are facing.
- For one, we want to avoid generating large number of JavaScript objects. Despite the ease of working with JavaScript objects, when the number starts to scale with data size we have observed this to sometime create bottlenecks in operation.
- For two, we envisoned a data format that does not require any unpacking. Why so? Because we are ingesting large quantity of data over the web during user session, clients sometime runs out of memory and crash. At some point, we need to consider options like offloading some data to disk for later consumption. However, after data buffer is unpacked to JavaScript objects, re-encoding that and subsequently decoding them again incurs too much CPU overhead that negatively impact performance.
- Protobuf using a schema backed data buffer technically should fulfil this requirement. If we know exactly where the data is (within the schema), we should be able to zero in on the exact spot on the data buffer to access a single data. However, this is an unusual use case so most frontend protobuf clients do not offer such API.
- Also for visualization use case, being able to read data efficiently in column format can greatly improve performance. Protobuf which stores data in row format (messages) is less efficient since accessing the same field in many records requires jumping from one pointer reference to another and plenty of decoding steps in between.
- We decided to roll our custom data format that meet these requirements.
- Along the way, while tackling the challenge of supporting operations on this data format, we discovered solutions that turned out to be useful for many other class on problems.
- `LazyArray` is one of the invention that derived from our work on the custom data format.
- We wanted a data structure that behaves like normal JavaScript array yet operates on immutable data. It turned out getters and lazy evaluations are perfect for this.
- But they also solves for us a larger class of problems like data manipulation on large arrays. Currently when mapping over large data array, we performed a lot of object cloning in order to do things like adding a piece of data while keeping the integrity of the original object. `LazyArray` which allows us to lazily combines values from multiple data column helps address this challenge.
- Another useful tool that came out from our work is efficient encoding of bitmask for working with `Optional` and `OneOf`.

## Data schema

- [Sample](/test/schema.js)
- Types represented using a list of key-values
- Use `name: { field1: Type, field2: Type }` for objects with fields (named tuple)
- Use `name: [ Type, Type, Type ]` for multiple values in tuple form
- Use `name: Type` for aliasing another type
- Or for applying modifier to a type. Eg `name: Modifier<Type>`
- Modifiers for higher order data types
  - `Array<Type>`
  - `Map<Type>`
  - `Optional<Type>`
  - `OneOf<Type, Type>`
  - `Ref<Type>` - for self-references
  - `Link<Type>` - for reference to data in another container
- Modifer can be nested. Eg.
  - `Optional<Array<Type>>`
  - `Array<Optional<Type>>` - the two are not the same
- In-built primitives types
  - `Uint8`
  - `Int8`
  - `Uint16`
  - `Int16`
  - `Uint32`
  - `Int32`
  - `Float32`
  - `Float64`
  - `String`
- More in-built primitives
  - `Vector2`
  - `Vector3`
  - `Vector4`
  - `Matrix3`
  - `Matrix4`
- Support for user specified custom primitives. Eg.
  - Enum values that is encoded in Uint8 but decodes to strings


## Data reader

[Example](/test/core.spec.js)

### Define a schema
```js
// schema.js
import { extendSchema } from 'this-library';

export const SCHEMA = extendSchema(
  {
    // define custom primitives here
  },
  {
    '#': {
        trackedEntities: 'Array<TrackedEntity>',
        trackedEntitiesOfInterest: 'Map<TrackedEntityRef>',
    },
    TrackedEntity: {
        id: 'Int32',
        class: 'Uint8',
        pose: 'Pose',
        velocity: 'Optional<Vector3>',
        source: 'TrackedEntitySource',
        waypoints: 'Optional<Array<TrackedEntityWayPoint>>'
    },
    ...
    // rest of type definitions
  }
);
```

### Create new reader from data schema
```js
// read.js
import { createReader, ALL_VALUES } from 'this-library';
import SCHEMA from './schema.js';

const Reader = createReader(buffer, SCHEMA);

const reader = new Reader('#', 0);
```

### Traverse data using `.get(key)`

```js
const trackedEntitiesReader = reader.get('trackedEntities').get(ALL_VALUES);
```

### Extract values using `.value()`
```js
const trackedEntities = trackedEntitiesReader.get('class').value()
```

### Explanation
- `.get(key)` always return another reader
- `.get(key)` behaves like `?.[key]` in JavaScript object access
- As such user need not worry about traversal terminating early when a dead end is reached. `Reader` can be traversed until a dead end is reached from the schema PoV not the actual data PoV. In another word, user do not need to call `.value()` every time to check if `undefined` has been reached. User can just traverse all the way to the target spot and call `.value()` at the end
- the exported symbol `ALL_VALUES` and `ALL_KEYS` can be use to extract all elements from an array or map (column based reading)
- when calling `.get(key)` on a reader that is pointing at an array or a map, an index array `.get([index1, index2, index3])` or string array `.get([key1, key2, key3])` can be provided respectively instead of the wildcard symbol `ALL_VALUES`
- when traversing to a `OneOf` type, a special `BranchedReader` instance is returned. Further traversal defaults to assuming user is on the first branch. To continue traversing the alternate branch(es), use the `.switchBranch(branchIndex)` method. Eg.

```js
const branchedReader = reader.get('someFieldWithOneOfType');
const oneOfValue = reader
  .get('field1') // traversing on first branch [0]
  .get('field11')
  .switchBranch()
  .get('field2') // traversing on second branch [1]
  .get('field22')
  .value()
```

- `.value()` returns either a single value or a `LazyArray` holding values (to be elaborated in a further section) depending on whether reader is in single value mode or multi values (column reading) mode. 
- Normally, which mode reader is in should be apparent from the traversal path (i.e. whether the path includes an array key or wildcard symbol). For debugging purpose, user can call the method `.singleValue()` to check which mode reader is in.
- calling `.value()` on a primitive type will return a primitive value (or an LazyArray that holds primitive value)
- calling `.value()` on a compound type will return the whole object by recursively walking the type tree
- exception is when encountering an array. A `LazyArray` will by returned in place of the array object to allow lazy decoding. Eg.

```js
// returns a LazyArray holding tracked entity objects
const trackedEntities = reader
  .get('trackedEntities')
  .get(ALL_VALUES)
  .value();

const firstValue = trackedEntities.get(0);
const allValues = [...trackedEntities];
```

- it is possible for `.value()` to return a `LazyArray` of `LazyArray` holding values. eg.

```js
// returns LazyArray<LazyArray<TrackedEntityWayPoint> | undefined>
const waypoints = reader
  .get('trackedEntities')
  .get(ALL_VALUES)
  .get('waypoints')
  .value();

const unpacked = [...waypoints.map(pts => [...pts])];
```

## LazyArray

- Custom data structure created to work well with our data reader but can but used in isolation
- Designed to simulate the functionalities of JavaScript [Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) class yet operating on immutable lists like values read off from a read-only buffer
- Values contined within `LazyArray` are accessed lazily

### Initialize a lazy array
```js
import { LazyArray } from 'this-library'

// by providing a read-only array
const arr1 = new LazyArray(source);

// by providing a getter function and a length value
const arr2 = new LazyArray(i => customSource.get(i), customSource.length);
```

### Accessing values
```js
const lazyArray = new LazyArray(source);

// by indexing
const firstValue = lazyArray.get(0);
const lastValue = lazyArray.get(arr.length - 1);

// by iterating
for (const v of lazyArray) {
  // do something with v
}
lazyArray.forEach(v => {
  // do something with v
});
const allValues = [...lazyArray];

// if you know the data type
const allValuesAsFloat32 = lazyArray.copyTo(Float32Array);
```

### Most array functions are supported

- `.forEach`
- `.map`

Re-indexing functions
- `.reverse`
- `.slice`
- `.filter`
- `.sort`

Reducing functions
- `.reduce`
- `.reduceRight`
- `.every`
- `.some`
- `.find`
- `.findIndex`
- `.indexOf`
- `.lastIndexOf`
- `.includes`

### Lazy evaluation

- when a `getter` function is passed into the `LazyArray` constructor, no call of `getter` is being made until a value is accessed. Eg.

```js
const spy = jest.spyOn(customSource, 'get');

const getter = i => customSource.get(i);

const lazyArray = new LazyArray(getter, customSource.length);

lazyArray.slice();
lazyArray.reverse();

expect(spy).not.toBeCalled(); // `.slice` & `.reverse` do not access value

lazyArr.findIndex(v => true);
expect(spy).toHaveBeenCalledTimes(1); // returns after first value is accessed
```

- `.map` returns another `LazyArray`. Lazily evaluated also. Eg.

```js
const mocked = jest.fn(v => 2 * v);

lazyArray.map(mocked);

expect(mocked).not.toBe.Called();
```

- when chaining and branching `.map` calls, user may prefer eager evaluation to avoid duplicating expensive computation. `.eagerEvaluate` method is provided for this purpose. Eg.

```js
const mappedA = lazyArr.map(someExpensiveComputation);
const mappedB = mappedA.map(fromAtoB);
const mappedC = mappedC.map(fromAtoC);
```

- subsequent reading of mappedB and mappedC will lead to someExpensiveComputation running twice on the same value. To avoid, use `.eagerEvaluate`

```js
const optimizedMappedA = lazyArr.map(someExpensiveComputation).eagerEvaluate();
```

- `.eagerEvaluate()` returns a `LazyArray` but the values inside `optimizedMapped` are pre-computed and stored in a normal JavaScript Array

- another approach for eager evaluation is calling the method `.copyTo` and supplying an array constructor

- `LazyArray` also has a `.findAll` method for re-indexing based on a secondary array

```js
const reindexed = lazyArray.findAll(
  secondary,
  (elementOfSecondary, elementOfLazyArray) => a.id === b.id
);
```

### Using LazyArray on multi-column data
```js
const allValuesReader = reader.get(ALL_VALUES);
const columnA = allValuesReader.get('colA').value();
const columnB = allValuesReader.get('colB').value();

const mapped = new LazyArray({ a: columnA, b: columnB }, columnA.length)
  .map(d => d.a + d.b);
```

- can be nested any number of levels. Eg.

```js
const allValuesReader = reader.get(ALL_VALUES);
const columnA = allValuesReader.get('colA').value();
const columnB = allValuesReader.get('colB').value();
const columnX = allValuesReader.get('colC').get('colX').value();
const columnY = allValuesReader.get('colC').get('colY').value();

const combined = {
  a: columnA,
  b: columnB, 
  c: {
    x: columnX,
    y: columnY
  }
};
const mapped = new LazyArray(combined, columnA.length)
  .map(d => d.a + d.b + d.c.x + d.c.y);
```



## Data encoder

- currently only implemented for NodeJs. Will be adding Pylon encoder soon.

```js
import { encodeWithSchema } from 'this-library';
import { SCHEMA } from './schema.js';

const encoded = encodeWithSchema(DATA, SCHEMA, '#');
// supply name of root type ('#') in third argument
```

- to specify a custom primitive type, provide an encode method and required byte size. Eg.

```js
export const SCHEMA = extendSchema(
  {
    SourceTypeEnum: {
      size: 1,
      decode: (dv, offset) => ['Lidar', 'Camera'][dv.getUint8(offset)],
      encode: (dv, offset, value) => {
        dv.setUint8(offset, ['Lidar', 'Camera'].indexOf(value));
      }
    }
  },
  {
    TrackedEntities: {
      id: 'Int32',
      class: 'Uint8',
      pose: 'Pose'
      source: 'SourceTypeEnum'
    },
    ...
    // rest of type definitions
  },
);
```

- when shape of data does not matches schema exactly a `transform` function can be provided to transform all instances of a certain type to the shape that is required. Using the third argument of `extendSchema`. Eg.

```js
export const SCHEMA = extendSchema(
  {
    // define custom primitives here
  },
  {
    // type definitions
  },
  {
    TrackedEntities: d => {
      return {
        ...d,
        waypoints: d.waypoints || d.deprecatedWaypointName
      }
    }
  }
);
```

- all branches of `OneOf` types should be accomplanied with a `check` function to discriminate from other branch(es). Not required if branch is a provided base primitive. Eg.

```js
export const SCHEMA = extendSchema(
  {
    // define custom primitives here
  },
  {
    ...
    CoordinatesOrPlaceName: 'OneOf<Vector2,PlaceName>',
    PlaceName: {
      long: 'String',
      short: 'String'
    }
  },
  {},
  {
    PlaceName: d => typeof d.long === 'string'
    // check for `Vector2` not required since it is one of the provided base primitives
  }
);
```


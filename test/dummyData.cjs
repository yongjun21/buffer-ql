const path = require('path');
const fs = require('fs');

const trackedEntities = generateTrackedEntitiesArray(10);

const dummyData = trackedEntities;

fs.writeFileSync(
  path.join(__dirname, 'dummyData.json'),
  JSON.stringify(dummyData, null, 2)
);

function generateTrackedEntitiesArray(count) {
  const entities = [];
  for (let i = 0; i < count; i++) {
    entities.push({
      id: i + 1,
      class: i % 2 === 0 ? 1 : 2,
      pose: generatePose(),
      velocity: i % 3 === 0 ? generateVector3() : undefined,
      source: generateTrackedEntitySource(),
      waypoints:
        i % 2 === 0
          ? generateTrackedEntityWayPointsArray(
              3 + Math.floor(Math.random() * 3)
            )
          : undefined
    });
  }
  return entities;
}

function generateTrackedEntityWayPointsArray(count) {
  const wayPoints = [];
  for (let i = 0; i < count; i++) {
    wayPoints.push({
      timestamp: i * 1000,
      pose: generatePose(),
      probability: i % 2 === 0 ? Math.random() : undefined
    });
  }
  return wayPoints;
}

function generatePose() {
  return {
    position: generateVector3(),
    rotation: generateVector3(),
    size: generateVector3()
  };
}

function generateVector3() {
  return [Math.random(), Math.random(), Math.random()];
}

function generateTrackedEntitySource() {
  const type = Math.random() < 0.5 ? 'Lidar' : 'Camera';
  return [
    type,
    type === 'Lidar' ? Math.floor(Math.random() * 1000) : 'camera123',
    Math.random() < 0.7 ? 'Some comments here' : undefined
  ];
}

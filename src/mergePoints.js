// Utilities for merging close points in VTK.js polydata
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';

/**
 * Method 2: Manual point merging using spatial hashing
 * Works when vtkCleanPolyData is not available
 *
 * @param {vtkPolyData} polyData - Input polydata
 * @param {number} tolerance - Distance threshold for merging (default: 1e-6)
 * @returns {vtkPolyData} - New polydata with merged points
 */
export function mergeClosePointsManual(polyData, tolerance = 1e-6) {
  const points = polyData.getPoints();
  const pointData = points.getData();
  const numPoints = points.getNumberOfPoints();

  // Create a map from old point IDs to new point IDs
  const pointMap = new Map();
  const newPoints = [];
  const pointToNewId = new Map();

  console.log(`Merging ${numPoints} points with tolerance ${tolerance}...`);

  // Fast path for exact duplicates (tolerance = 0)
  if (tolerance === 0) {
    const exactHash = new Map();

    for (let i = 0; i < numPoints; i++) {
      const x = pointData[i * 3];
      const y = pointData[i * 3 + 1];
      const z = pointData[i * 3 + 2];

      // Create exact coordinate hash
      const key = `${x},${y},${z}`;

      if (exactHash.has(key)) {
        // Reuse existing point
        pointMap.set(i, exactHash.get(key));
      } else {
        // Add new unique point
        const newId = newPoints.length / 3;
        newPoints.push(x, y, z);
        pointMap.set(i, newId);
        exactHash.set(key, newId);
      }
    }

    console.log(`Reduced from ${numPoints} to ${newPoints.length / 3} points`);
    return remapPolyDataPoints(polyData, newPoints, pointMap);
  }

  // Spatial hash grid for proximity-based merging
  const gridSize = tolerance;
  const spatialHash = new Map();

  const getHashKey = (x, y, z) => {
    const ix = Math.floor(x / gridSize);
    const iy = Math.floor(y / gridSize);
    const iz = Math.floor(z / gridSize);
    return `${ix},${iy},${iz}`;
  };

  // Process each point
  for (let i = 0; i < numPoints; i++) {
    const x = pointData[i * 3];
    const y = pointData[i * 3 + 1];
    const z = pointData[i * 3 + 2];

    // Check nearby cells in spatial hash
    let foundMatch = false;
    const hashKey = getHashKey(x, y, z);

    // Check current cell and neighboring cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const ix = Math.floor(x / gridSize) + dx;
          const iy = Math.floor(y / gridSize) + dy;
          const iz = Math.floor(z / gridSize) + dz;
          const neighborKey = `${ix},${iy},${iz}`;

          const candidateIds = spatialHash.get(neighborKey);
          if (!candidateIds) continue;

          // Check distance to candidates
          for (const candidateId of candidateIds) {
            // candidateId is the point ID, convert to array index
            const idx = candidateId * 3;
            const diffX = x - newPoints[idx];
            const diffY = y - newPoints[idx + 1];
            const diffZ = z - newPoints[idx + 2];
            const dist = Math.sqrt(diffX*diffX + diffY*diffY + diffZ*diffZ);

            if (dist <= tolerance) {
              // Found a match, use existing point (candidateId is already the point ID)
              pointMap.set(i, candidateId);
              foundMatch = true;
              break;
            }
          }
          if (foundMatch) break;
        }
        if (foundMatch) break;
      }
      if (foundMatch) break;
    }

    if (!foundMatch) {
      // Add new unique point
      const newId = newPoints.length / 3;
      newPoints.push(x, y, z);
      pointMap.set(i, newId);

      // Add to spatial hash (store point ID, not array index)
      if (!spatialHash.has(hashKey)) {
        spatialHash.set(hashKey, []);
      }
      spatialHash.get(hashKey).push(newId);
    }
  }

  console.log(`Reduced from ${numPoints} to ${newPoints.length / 3} points`);

  // Create new polydata with merged points
  const newPolyData = remapPolyDataPoints(polyData, newPoints, pointMap);
  return newPolyData;
}

/**
 * Helper function to create new polydata with remapped points
 */
function remapPolyDataPoints(originalPolyData, newPointsArray, pointMap) {
  const newPolyData = vtkPolyData.newInstance();

  // Set new points
  const points = vtkPoints.newInstance();
  points.setData(Float32Array.from(newPointsArray));
  newPolyData.setPoints(points);

  // Remap cells (polys)
  const originalPolys = originalPolyData.getPolys();
  if (originalPolys) {
    const originalCellData = originalPolys.getData();
    const newCellData = [];

    let offset = 0;
    const numCells = originalPolyData.getNumberOfPolys();

    for (let cellId = 0; cellId < numCells; cellId++) {
      const cellSize = originalCellData[offset++];
      newCellData.push(cellSize);

      for (let i = 0; i < cellSize; i++) {
        const oldPointId = originalCellData[offset++];
        const newPointId = pointMap.get(oldPointId);
        newCellData.push(newPointId);
      }
    }

    const polys = vtkCellArray.newInstance();
    polys.setData(Uint32Array.from(newCellData));
    newPolyData.setPolys(polys);
  }

  // Remap lines if present
  const originalLines = originalPolyData.getLines();
  if (originalLines && originalLines.getNumberOfCells() > 0) {
    const originalLineData = originalLines.getData();
    const newLineData = [];

    let offset = 0;
    const numLines = originalLines.getNumberOfCells();

    for (let lineId = 0; lineId < numLines; lineId++) {
      const lineSize = originalLineData[offset++];
      newLineData.push(lineSize);

      for (let i = 0; i < lineSize; i++) {
        const oldPointId = originalLineData[offset++];
        const newPointId = pointMap.get(oldPointId);
        newLineData.push(newPointId);
      }
    }

    const lines = vtkCellArray.newInstance();
    lines.setData(Uint32Array.from(newLineData));
    newPolyData.setLines(lines);
  }

  // Remap vertices if present
  const originalVerts = originalPolyData.getVerts();
  if (originalVerts && originalVerts.getNumberOfCells() > 0) {
    const originalVertData = originalVerts.getData();
    const newVertData = [];

    let offset = 0;
    const numVerts = originalVerts.getNumberOfCells();

    for (let vertId = 0; vertId < numVerts; vertId++) {
      const vertSize = originalVertData[offset++];
      newVertData.push(vertSize);

      for (let i = 0; i < vertSize; i++) {
        const oldPointId = originalVertData[offset++];
        const newPointId = pointMap.get(oldPointId);
        newVertData.push(newPointId);
      }
    }

    const verts = vtkCellArray.newInstance();
    verts.setData(Uint32Array.from(newVertData));
    newPolyData.setVerts(verts);
  }

  return newPolyData;
}

/**
 * Method 4: Merge duplicate/close points with configurable tolerance
 * @param {vtkPolyData} polyData - Input polydata
 * @param {number} tolerance - Distance threshold (default: 0.0 for exact duplicates only)
 */
export function removeDuplicatePoints(polyData, tolerance = 0.0) {
  return mergeClosePointsManual(polyData, tolerance);
}

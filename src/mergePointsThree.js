// Point merging for Three.js BufferGeometry
// Ported from mergePoints.js to work with Three.js geometry

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge duplicate and near-duplicate points in Three.js geometry
 * @param {THREE.BufferGeometry} geometry - Input geometry
 * @param {number} tolerance - Merging tolerance (0 = exact duplicates only)
 * @returns {THREE.BufferGeometry} - Geometry with merged points
 */
export function mergePoints(geometry, tolerance = 0) {
  if (tolerance === 0) {
    // Use Three.js built-in mergeVertices for exact duplicates
    return BufferGeometryUtils.mergeVertices(geometry, 0);
  }

  // For proximity-based merging, implement custom algorithm
  return mergePointsWithTolerance(geometry, tolerance);
}

/**
 * Merge points within tolerance using spatial hashing
 * @param {THREE.BufferGeometry} geometry
 * @param {number} tolerance
 * @returns {THREE.BufferGeometry}
 */
function mergePointsWithTolerance(geometry, tolerance) {
  const positions = geometry.attributes.position.array;
  const numPoints = positions.length / 3;

  // Build spatial hash grid
  const gridSize = tolerance;
  const spatialHash = new Map();

  const getGridKey = (x, y, z) => {
    const gx = Math.floor(x / gridSize);
    const gy = Math.floor(y / gridSize);
    const gz = Math.floor(z / gridSize);
    return `${gx},${gy},${gz}`;
  };

  const pointMap = new Map(); // old index -> new index
  const newPositions = [];
  const toleranceSq = tolerance * tolerance;

  for (let i = 0; i < numPoints; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    const gridKey = getGridKey(x, y, z);

    // Check neighboring cells for nearby points
    let foundMatch = false;

    // Check 27 neighboring cells (3x3x3 cube)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const gx = Math.floor(x / gridSize) + dx;
          const gy = Math.floor(y / gridSize) + dy;
          const gz = Math.floor(z / gridSize) + dz;
          const neighborKey = `${gx},${gy},${gz}`;

          if (spatialHash.has(neighborKey)) {
            const candidates = spatialHash.get(neighborKey);

            for (const candidateIdx of candidates) {
              const cx = newPositions[candidateIdx * 3];
              const cy = newPositions[candidateIdx * 3 + 1];
              const cz = newPositions[candidateIdx * 3 + 2];

              const distSq = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;

              if (distSq <= toleranceSq) {
                // Found a nearby point - merge
                pointMap.set(i, candidateIdx);
                foundMatch = true;
                break;
              }
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
      const newIdx = newPositions.length / 3;
      newPositions.push(x, y, z);
      pointMap.set(i, newIdx);

      // Add to spatial hash
      if (!spatialHash.has(gridKey)) {
        spatialHash.set(gridKey, []);
      }
      spatialHash.get(gridKey).push(newIdx);
    }
  }

  // Remap indices
  const oldIndices = geometry.index ? geometry.index.array : null;
  let newIndices;

  if (oldIndices) {
    newIndices = new Uint32Array(oldIndices.length);
    for (let i = 0; i < oldIndices.length; i++) {
      newIndices[i] = pointMap.get(oldIndices[i]);
    }
  } else {
    // Non-indexed geometry - create indices
    newIndices = new Uint32Array(numPoints);
    for (let i = 0; i < numPoints; i++) {
      newIndices[i] = pointMap.get(i);
    }
  }

  // Create new geometry
  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPositions), 3));
  newGeometry.setIndex(new THREE.BufferAttribute(newIndices, 1));
  newGeometry.computeVertexNormals();

  console.log(`Merged ${numPoints} points down to ${newPositions.length / 3} (tolerance: ${tolerance})`);

  return newGeometry;
}

/**
 * Remove degenerate triangles from geometry
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry}
 */
export function removeDegenerateCells(geometry) {
  const positions = geometry.attributes.position.array;
  const indices = geometry.index ? geometry.index.array : null;

  if (!indices) {
    console.warn('Cannot remove degenerate cells from non-indexed geometry');
    return geometry;
  }

  const validIndices = [];
  let duplicateCount = 0;
  let collinearCount = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    // Check for duplicate vertices
    if (i0 === i1 || i1 === i2 || i0 === i2) {
      duplicateCount++;
      continue;
    }

    // Get vertices
    const v0 = new THREE.Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
    const v1 = new THREE.Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
    const v2 = new THREE.Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);

    // Check for collinear vertices using cross product
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const cross = new THREE.Vector3().crossVectors(edge1, edge2);
    const crossMag = cross.length();

    // Threshold for collinearity
    if (crossMag < 1e-6) {
      collinearCount++;
      continue;
    }

    // Valid triangle
    validIndices.push(i0, i1, i2);
  }

  if (duplicateCount > 0) {
    console.warn(`Removed ${duplicateCount} degenerate triangles (duplicate vertices)`);
  }
  if (collinearCount > 0) {
    console.warn(`Removed ${collinearCount} degenerate triangles (collinear vertices, zero area)`);
  }

  // Create new geometry with valid triangles only
  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute('position', geometry.attributes.position.clone());
  newGeometry.setIndex(validIndices);
  newGeometry.computeVertexNormals();

  return newGeometry;
}

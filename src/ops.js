// Core operations for boundary detection and polyline tracing

import { GEOMETRY_TOLERANCES } from './renderConfig';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtk from "@kitware/vtk.js/vtk";
import { saveAs } from 'file-saver';


export function detectBoundaryEdgesSTLWithAdjacency(polyData) {
  const cells = polyData.getPolys();
  const cellData = cells.getData();
  const numCells = polyData.getNumberOfPolys();

  // Edge counting
  const edgeCount = Object.create(null);
  const edgePoints = Object.create(null);

  // Hash function - Cantor pairing (assumes a <= b)
  const hash = (a, b) => b * b + a;
  let offset = 0;
  let edgeNum = 0;
  // First pass: count edges
  for (let cellId = 0; cellId < numCells; cellId++) {
    offset++; // skip cell size (always 3 for triangles)

    const triIdx = [0, 0, 0];
    triIdx[0] = cellData[offset++];
    triIdx[1] = cellData[offset++];
    triIdx[2] = cellData[offset++];

    triIdx.forEach((_, i) => {
      const p0 = triIdx[i];
      const p1 = triIdx[(i + 1) % 3];
      // const pt_min = Math.min(p0, p1);
      // const pt_max = Math.max(p0, p1);
      const [rotation, pt_min, pt_max] = p0 < p1 ? [1, p0, p1] : [-1, p1, p0];
      const h = hash(pt_min, pt_max);

      const count = (edgeCount[h] || 0) + 1;
      edgeCount[h] = count;

      if (count === 1) {
        // First time seeing this edge - store it
        edgePoints[h] = [pt_min, pt_max, rotation, cellId, i];
        edgeNum++;
      } else if (count === 2) {
        // Second time - it's internal, remove both entries
        delete edgeCount[h];
        delete edgePoints[h];
      }
    });
  }
  console.log(`Found ${edgeNum} boundary edges`);
  console.log(`Found ${Object.keys(edgeCount).length} boundary edges`);
  // Extract boundary edges and build adjacency map
  const boundaryEdges = [];
  const adjacencyMap = new Map();
  for (const h in edgeCount) {
      const [p0, p1, rotation, cellId, side] = edgePoints[h];
      boundaryEdges.push([p0, p1]);

      // Build adjacency map
      if (!adjacencyMap.has(p0)) adjacencyMap.set(p0, new Set());
      if (!adjacencyMap.has(p1)) adjacencyMap.set(p1, new Set());

      adjacencyMap.get(p0).add([p1, rotation, cellId, side]);
      adjacencyMap.get(p1).add([p0, -rotation, cellId, side]);
  }

  // === VALIDATION LOGGING (stitchJS) ===
  console.log('\n=== STITCHJS BOUNDARY DETECTION RESULTS ===');
  console.log(`Total triangles analyzed: ${numCells}`);
  console.log(`Boundary edges: ${boundaryEdges.length}`);
  console.log(`Boundary points: ${adjacencyMap.size}`);

  // Analyze adjacency structure
  let openEnds = 0, normalPoints = 0, junctions = 0;
  adjacencyMap.forEach((neighbors) => {
    if (neighbors.size === 1) openEnds++;
    else if (neighbors.size === 2) normalPoints++;
    else junctions++;
  });
  console.log(`  - Open ends: ${openEnds}`);
  console.log(`  - Normal points (2 neighbors): ${normalPoints}`);
  console.log(`  - Junctions (3+ neighbors): ${junctions}`);

  // Sample first 10 boundary edges
  console.log('\nFirst 10 boundary edges:');
  boundaryEdges.slice(0, 10).forEach((edge, idx) => {
    console.log(`  [${idx}] Edge ${edge[0]}-${edge[1]}`);
  });

  // Log adjacency map structure for first 5 boundary points
  console.log('\nFirst 5 boundary points adjacency:');
  let count = 0;
  for (const [pointId, neighbors] of adjacencyMap.entries()) {
    if (count >= 5) break;
    const neighborList = Array.from(neighbors).map(([nId, rot, cell, side]) =>
      `neighbor=${nId}, rot=${rot}, cell=${cell}, side=${side}`
    );
    console.log(`  Point ${pointId}: ${neighbors.size} neighbors`);
    neighborList.forEach(n => console.log(`    ${n}`));
    count++;
  }
  console.log('='.repeat(50));

  return { boundaryEdges, adjacencyMap };
}

export function detectSharpCornersWithMap(polyData, boundaryData, angleThreshold = 30) {
  const { adjacencyMap } = boundaryData;
  const points = polyData.getPoints();
  const pointData = points.getData();

  const corners = [];
  const cosThreshold = Math.cos(angleThreshold * Math.PI / 180);

  // Iterate through boundary points
  adjacencyMap.forEach((neighbors, pointId) => {
    
      // Get coordinates
      const px = pointData[pointId * 3];
      const py = pointData[pointId * 3 + 1];
      const pz = pointData[pointId * 3 + 2];

    if (neighbors.size == 2) {
      const [pack1, pack2] = Array.from(neighbors);

      const [n1, rotation1, cellId1, side1] = pack1;
      const [n2, rotation2, cellId2, side2] = pack2;

      const p1x = pointData[n1 * 3];
      const p1y = pointData[n1 * 3 + 1];
      const p1z = pointData[n1 * 3 + 2];

      const p2x = pointData[n2 * 3];
      const p2y = pointData[n2 * 3 + 1];
      const p2z = pointData[n2 * 3 + 2];

      // Vectors from point to neighbors
      let v1x = p1x - px;
      let v1y = p1y - py;
      let v1z = p1z - pz;

      let v2x = p2x - px;
      let v2y = p2y - py;
      let v2z = p2z - pz;

      // Normalize
      const len1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
      const len2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);

      if (len1 === 0 || len2 === 0) return;

      v1x /= len1; v1y /= len1; v1z /= len1;
      v2x /= len2; v2y /= len2; v2z /= len2;

      // Dot product
      const dot = v1x * v2x + v1y * v2y + v1z * v2z;

      // Check if sharp corner (small angle = high dot product)
      if (dot > cosThreshold) {
        const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
        corners.push({
          pointId,
          position: [px, py, pz],
          angle,
          neighbors: [n1, n2]
        });
      }
    }
    else if (neighbors.size > 2) {
      // Imagine that there are two rings sharing one point. 
      // This point will have more than 2 neighbors.
      // It is also considered a corner.
      const angle = -1;
      corners.push({
        pointId,
        position: [px, py, pz],
        angle,
        neighbors: Array.from(neighbors).map(n => n[0])
      });
    }
  });
  // No need to sort by angle
  // corners.sort((a, b) => a.angle - b.angle);
  return corners;
}

export function detechBoundaryPolylines(polyData, boundaryData, corners) {
  const { adjacencyMap } = boundaryData;
  const points = polyData.getPoints();
  const pointData = points.getData();

  const cornerIds = corners.map(c => c.pointId);
  const polyLineArray = [];
  const neighborCells = new Map();

  // Helper function to mark cell side as visited
  const markCellSide = (cellId, sideId) => {
    if (!neighborCells.has(cellId)) {
      const side_ = [0, 0, 0];
      side_[sideId] = 1;
      neighborCells.set(cellId, side_);
    } 
    
    else if (neighborCells.get(cellId)[sideId] === 1)
    {
      return false;
    }
    else {
      neighborCells.get(cellId)[sideId] = 1;
    }
    return true;
  };

  // tracing down along the polyline
  const tracePolyline = (polyLine, adjacencyMap) => {

    if (polyLine.length < 2)
      return;
    
    // Last element
    const [neighborId,rotation, cellId, sideId] = polyLine[polyLine.length - 1];
    // Last point
    if (cornerIds.includes(neighborId) || adjacencyMap.get(neighborId).size !== 2)
    {
      return;
    }
    // It has more neighbors
    // First element
    adjacencyMap.get(neighborId).forEach(([n, r, c, a]) => {
      // n is the same as the previous element
      const prevId = polyLine[polyLine.length - 2][0];
      if (n === prevId || (neighborCells.has(c) && neighborCells.get(c)[a] === 1))
        return;

      if (!markCellSide(c, a)) // visited already
        return;

      polyLine.push([n, r, c, a]);
      tracePolyline(polyLine, adjacencyMap);
    })
  }

  corners.forEach(corner => {
    const cornerId = corner.pointId;
    const neighbors = adjacencyMap.get(cornerId);
    // Multiple neighbors and loop over them
    Array.from(neighbors).forEach(([neighborId, rotation, cellId, sideId]) => {
      // Skip if already visited from this side
      if (neighborCells.has(cellId) && neighborCells.get(cellId)[sideId] === 1) {
        return;
      }

      // Mark cell/side as visited
      if (!markCellSide(cellId, sideId))
        return;

      // Initialize polyline starting from corner
      const polyLine = [[cornerId, rotation, cellId, sideId]];
      polyLine.push([neighborId, rotation, cellId, sideId]);

      // Trace the polyline
      tracePolyline(polyLine, adjacencyMap);

      polyLineArray.push(polyLine);
    })
  })

  // Pre-build cell lookup table for efficiency
  const cells = polyData.getPolys();
  const cellData = cells.getData();
  const numCells = polyData.getNumberOfPolys();
  const cellLookup = new Map();

  let offset = 0;
  for (let cellId = 0; cellId < numCells; cellId++) {
    const numPts = cellData[offset];
    const pts = [];
    for (let i = 0; i < numPts; i++) {
      pts.push(cellData[offset + 1 + i]);
    }
    cellLookup.set(cellId, pts);
    offset += numPts + 1;
  }

  // Convert polyLineArray to the format expected by index.js
  // Each polyline needs: { positions: [[x,y,z], ...], euclideanLength: number }
  const polylines = polyLineArray.map(polyLine => {
    const positions = polyLine.map(([pointId]) => {
      const idx = pointId * 3;
      return [pointData[idx], pointData[idx + 1], pointData[idx + 2]];
    });

    // Extract point IDs
    const pointIds = polyLine.map(([pointId]) => pointId);

    // Extract cell IDs and build cell details
    const cellIds = [];
    const cellIdSet = new Set();
    const cellDetails = [];

    polyLine.forEach(([pointId, rotation, cellId, sideId]) => {
      if (cellId !== undefined && !cellIdSet.has(cellId)) {
        cellIds.push(cellId);
        cellIdSet.add(cellId);

        // Get the point IDs from the lookup table
        const pts = cellLookup.get(cellId);
        if (pts) {
          cellDetails.push({ cellId, pointIds: pts });
        }
      }
    });

    // Calculate euclidean length
    let euclideanLength = 0;
    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i][0] - positions[i - 1][0];
      const dy = positions[i][1] - positions[i - 1][1];
      const dz = positions[i][2] - positions[i - 1][2];
      euclideanLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    return {
      positions,
      pointIds,
      cellIds,
      cellDetails,
      euclideanLength,
      pointCount: positions.length
    };
  });

  return { polylines, polyLineArray };
}

const point2SegmentDistance = (point, segment, tolerance = 1e-8) => {
  const [p0, p1] = segment;

  const distToP0 = Math.sqrt(Math.pow(point[0] - p0[0], 2) + Math.pow(point[1] - p0[1], 2) + Math.pow(point[2] - p0[2], 2));
  if (distToP0 <= tolerance) {
    return { distance: 0, t: 0 };
  }

  const distToP1 = Math.sqrt(Math.pow(point[0] - p1[0], 2) + Math.pow(point[1] - p1[1], 2) + Math.pow(point[2] - p1[2], 2));
  if (distToP1 <= tolerance) {
    return { distance: 0, t: 1 };
  }

  // Project point onto segment and return 0 to 1.
  // O means point is at p0
  // 1 means point is at p1
  // 0.5 means point is at the middle of the segment
  const v = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]; // Segment vector
  const w = [point[0] - p0[0], point[1] - p0[1], point[2] - p0[2]]; // Vector from p0 to point

  const dot_w_v = w[0] * v[0] + w[1] * v[1] + w[2] * v[2];
  const dot_v_v = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];

  // The segment is a point.
  if (dot_v_v < tolerance) {
    const dist = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
    return { distance: dist, t: 0 };
  }

  // t is the projection parameter.
  const t = dot_w_v / dot_v_v;

  let closestPoint;
  if (t < 0) {
    closestPoint = p0;
  } else if (t > 1) {
    closestPoint = p1;
  } else {
    closestPoint = [p0[0] + t * v[0], p0[1] + t * v[1], p0[2] + t * v[2]];
  }

  const dx = point[0] - closestPoint[0];
  const dy = point[1] - closestPoint[1];
  const dz = point[2] - closestPoint[2];

  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Return distance and the unclamped projection parameter t
  return { distance, t };
}

const coupleTwoPolyLines = (polyData, polyLine1, polyLine2, cellMap, tolerance) => {

  const internals1 = polyLine1.slice(1, -1); // Exclude endpoints

  if (internals1.length === 0)
    return;

  const cells = polyData.getPolys();
  const cellData = cells.getData();
  const points = polyData.getPoints();

  const extractPoints = (polyLine) => {
    return polyLine.slice(1).map((element) => {
      const [, , cellId, sideId] = element;
      const triIds = cellData.slice(cellId * 4 + 1, cellId * 4 + 4);
      const pointIds = [...triIds, triIds[0]].slice(sideId, sideId + 2);
      const pointCords = pointIds.map(pointId => {
        // const idx = pointId * 3;
        // return [points.getData()[idx], points.getData()[idx + 1], points.getData()[idx + 2]];
        return points.getData().slice(pointId * 3, pointId * 3 + 3);
      });
      return [cellId, sideId, pointIds, pointCords];
    })
  }
  // const segments1 = extractPoints(polyLine1);
  const segments2 = extractPoints(polyLine2);

  const recording_ = [];
  internals1.forEach(element => {
    const pointId = element[0];
    const point = points.getData().slice(pointId * 3, pointId * 3 + 3);
    segments2.some(segment => {
      const [cellId, sideId, pointIds, pointCords] = segment;
      const { distance, t } = point2SegmentDistance(point, pointCords, GEOMETRY_TOLERANCES.PROXIMITY_TOLERANCE);
      if (distance <= tolerance && t >= 0 && t <= 1) {
        // pointMap.set(pointId, [cellId, sideId, t]);
        if (!cellMap.has(cellId))
        {
          cellMap.set(cellId, [new Set(), new Set(), new Set()]);
          cellMap.get(cellId)[sideId].add([t, pointId]);
        }
        else {
          cellMap.get(cellId)[sideId].add([t, pointId]);
        }
        recording_.push([pointId, cellId, sideId, distance, t]);
        return true;
      }
    })
  })
}

function calTriArea(p0, p1, p2) {
  const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

  // Calculate the cross product of the two edge vectors
  const crossProduct = [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0]
  ];

  // The area of the triangle is half the magnitude of the cross product vector
  const magnitude = Math.sqrt(crossProduct[0]**2 + crossProduct[1]**2 + crossProduct[2]**2);
  return 0.5 * magnitude;
}

function refineTriangle(orderedPoints, polyData) {
  const triangles = [];
  const points = polyData.getPoints();
  // There are i points on Side 0 including the corners
  // There are j points on Side 1 including the corners,
  // There are k points on Side 2 including the corners.
  // For the triangles using the first i - 1 points and the second last point on side 2 (
  // i.e. the last point excluding the corner).
  const inner = [];
  for (let sideId = 0; sideId < 3; sideId++) {
    const oppositeSide = orderedPoints[(sideId + 2) % 3];

    // Safeguard: skip if opposite side doesn't have enough points for an apex
    if (oppositeSide.length < 2) {
      console.warn(`Side ${(sideId + 2) % 3} has insufficient points for apex selection`);
      continue;
    }

    const apex = oppositeSide[oppositeSide.length - 2];
    inner.push(apex);
    const apexCoord = points.getData().slice(apex * 3, apex * 3 + 3);

    for (let segId = 0; segId < orderedPoints[sideId].length - 2; segId++) {
      const p0 = orderedPoints[sideId][segId];
      const p1 = orderedPoints[sideId][segId + 1];
      const area = calTriArea(points.getData().slice(p0 * 3, p0 * 3 + 3),
      points.getData().slice(p1 * 3, p1 * 3 + 3),
      apexCoord);
      if (area > GEOMETRY_TOLERANCES.MIN_TRIANGLE_AREA) {
        triangles.push([p0, p1, apex]);
      }
    }
  }

  // Safeguard: only add inner triangle if we have 3 valid apexes
  if (inner.length === 3) {
    triangles.push(inner);
  } else {
    console.warn(`Incomplete inner triangle: only ${inner.length} apexes found`);
  }

  return triangles;
}

function reTriangulateCells(polyData, stitchMap) {
  const cells = polyData.getPolys();
  const cellData = cells.getData();
  const points = polyData.getPoints();
  // const pointData = points.getData();

  const cells_to_remove = new Set();
  const cells_to_add = vtkCellArray.newInstance();
  stitchMap.forEach((info, cellId) => {
    cells_to_remove.add(cellId);
    const orderedPoints = [[], [], []];
    info.forEach((sidePoints, sideId) => {
      // const start_point = cells.getCellPoints(cellId)[sideId];
      // First element is numebr of points
      const start_point = cellData[cellId * 4 + 1 + sideId]; // Index of the first point
      const end_point = cellData[cellId * 4 + 1 + (sideId + 1) % 3]; // Index of the last point
      const follow_point = Array.from(sidePoints).sort((a, b) => a[0] - b[0]).map(p => p[1]);
      orderedPoints[sideId].push(start_point);
      orderedPoints[sideId].push(...follow_point);
      orderedPoints[sideId].push(end_point);
    })
    const newTriangles = refineTriangle(orderedPoints, polyData);
    newTriangles.forEach(triangle => {
      // Add triangle to cell array (format: [numPoints, pointId1, pointId2, pointId3])
      cells_to_add.insertNextCell([triangle[0], triangle[1], triangle[2]]);
    })
  })

  // Rebuild cell array: copy unchanged cells + add new triangles
  const numCells = polyData.getNumberOfPolys();
  const newCellData = [];

  // Copy unchanged cells
  for (let cellId = 0; cellId < numCells; cellId++) {
    if (!cells_to_remove.has(cellId)) {
      const pointIds = cellData.slice(cellId * 4, cellId * 4 + 4);
      newCellData.push(...pointIds);
    }
  }

  // Append new triangles from cells_to_add
  const addedData = cells_to_add.getData();
  newCellData.push(...addedData);

  // Create final cell array and update polyData
  const finalCells = vtkCellArray.newInstance();
  finalCells.setData(Uint32Array.from(newCellData));

  // cleanedPolyData
  const cleanedPolyData = vtkPolyData.newInstance();
  cleanedPolyData.setPoints(points);
  cleanedPolyData.setPolys(finalCells);
  // polyData.setPolys(finalCells);
  // polyData.modified();

  return cleanedPolyData
}

export function stitchEdge(polyData, polyLineArray) {
  const cells = polyData.getPolys();
  const cellData = cells.getData();
  const numCells = polyData.getNumberOfPolys();


  // Populate polyLineMap
  const polyLineMap = new Map();
  polyLineArray.forEach((polyLine, idx) => {
    const first_element = polyLine[0];
    const last_element = polyLine[polyLine.length - 1];
    const first_id = Math.min(first_element[0], last_element[0]);
    const last_id = Math.max(first_element[0], last_element[0]);
    const key = `${first_id}-${last_id}`;
    if (!polyLineMap.has(key)) {
      polyLineMap.set(key, [idx]);
    }
    else {
      polyLineMap.get(key).push(idx);
    }
  });

  // Find the opposite edge
  // The basic idea: slit means there are two boundary polylines are very close to each other.
  // But the points are not conformal.To project the points on one polyline to the other one.
  // The projected points are used to split the targeting facet (triangle) unless it is close to corner of a triangle.
  // In the case, it could be merged later. However, this possiblity is very low, because point merging has been conducted during the conversion.
  // stitchMap is used to record the cell that will be split and its side (decided by the sideId). The split is based on "t", and
  // the corresponding pointId is also recorded.
  const stitchMap = new Map();
  polyLineMap.forEach((indexArray, key) => {
    // Compare each pair of polylines exactly once
    for (let i = 0; i < indexArray.length; i++) {
      const currentPolyLine = polyLineArray[indexArray[i]];
      for (let j = i + 1; j < indexArray.length; j++) {
        const otherPolyLine = polyLineArray[indexArray[j]];
        coupleTwoPolyLines(polyData, currentPolyLine, otherPolyLine, stitchMap, GEOMETRY_TOLERANCES.POLYLINE_DISTANCE_TOLERANCE);
        coupleTwoPolyLines(polyData, otherPolyLine, currentPolyLine, stitchMap, GEOMETRY_TOLERANCES.POLYLINE_DISTANCE_TOLERANCE);
      }
    }
  });

  // Topology change to remove the cell will be split. Triangulate the those cells with split points to make them conformal.
  const cleanedPolyData = reTriangulateCells(polyData, stitchMap);
  // Save VTK after repair
  return cleanedPolyData;
}

export function analyzePolylines(polylines) {
  // Sort by length for easier analysis
  return polylines.slice().sort((a, b) => b.euclideanLength - a.euclideanLength);
}

/**
 * Converts a vtkPolyData object into a string in the VTK legacy ASCII format.
 * This string can be saved as a .vtk file.
 * @param {vtkPolyData} polyData The vtkPolyData object to convert.
 * @returns {string} A string representing the polyData in VTK ASCII format.
 */
export function polyDataToASCII(polyData) {
  const points = polyData.getPoints();
  const pointData = points.getData();
  const numPoints = points.getNumberOfPoints();

  const polys = polyData.getPolys();
  const cellData = polys.getData();
  const numCells = polys.getNumberOfCells();
  const totalCellSize = cellData.length;

  const lines = [];

  // 1. Header
  lines.push('# vtk DataFile Version 3.0');
  lines.push('Generated by polyDataToASCII');
  lines.push('ASCII');
  lines.push('DATASET POLYDATA');

  // 2. Points
  lines.push(`POINTS ${numPoints} float`);
  for (let i = 0; i < numPoints; i++) {
    const idx = i * 3;
    lines.push(`${pointData[idx]} ${pointData[idx + 1]} ${pointData[idx + 2]}`);
  }

  // 3. Polygons (Cells)
  lines.push(`POLYGONS ${numCells} ${totalCellSize}`);
  let offset = 0;
  while (offset < totalCellSize) {
    const numPtsInCell = cellData[offset];
    const cellPoints = [];
    for (let i = 0; i < numPtsInCell; i++) {
      cellPoints.push(cellData[offset + 1 + i]);
    }
    lines.push(`${numPtsInCell} ${cellPoints.join(' ')}`);
    offset += numPtsInCell + 1;
  }

  // Join all lines with a newline character
  return lines.join('\n');
}

export async function downloadPolyDataAsASCII(polyData, filename = 'repaired.vtk') {
  const data = polyDataToASCII(polyData);
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  // Use the File System Access API when available (lets user choose location),
  // otherwise fall back to prompting for a filename and using file-saver.
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'VTK PolyData File',
          accept: {
            'text/plain': ['.vtk'],
          },
        }],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();

      console.log('File saved successfully via showSaveFilePicker!');
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('User aborted the save picker');
        return;
      }
      console.error('Could not save the file via showSaveFilePicker:', err);
      // fall through to fallback below
    }
  }

  // Fallback: ask for a filename (so the user can choose a name) and trigger download
  try {
    let chosenName = filename;
    // Some browsers will still show a Save As dialog when downloading a blob, but
    // to make filename explicit we prompt the user for a preferred filename.
    try {
      const userInput = window.prompt('Enter filename for VTK export', filename);
      // If user pressed Cancel, window.prompt returns null — abort saving
      if (userInput === null) {
        console.log('User cancelled filename prompt; aborting VTK save.');
        return;
      }
      if (userInput && userInput.trim().length > 0) {
        chosenName = userInput.trim();
      }
    } catch (e) {
      // ignore prompt errors and use default filename
    }

    // Use file-saver which will suggest the filename and trigger browser download
    saveAs(blob, chosenName);
    console.log('File saved via fallback download (file-saver).');
  } catch (err) {
    console.error('Could not save the file via fallback method:', err);
  }
}

/**
 * Request write permission for a file or directory handle.
 * Returns true if permission is granted.
*/
export async function ensureWritePermission(handle) {
  if (!handle) return false;
  try {
    const opts = { mode: 'readwrite' };
    // queryPermission may not exist on some handles
    if (handle.queryPermission) {
      const q = await handle.queryPermission(opts);
      if (q === 'granted') return true;
    }
    if (handle.requestPermission) {
      const r = await handle.requestPermission(opts);
      return r === 'granted';
    }
    // Fallback optimistic return
    return true;
  } catch (err) {
    console.error('Permission check failed', err);
    return false;
  }
}

/**
 * Save polyData as ASCII into a chosen directory handle.
 * dirHandle: obtained from window.showDirectoryPicker()
*/
export async function savePolyDataToDirectory(dirHandle, polyData, filename = 'repaired.vtk') {
  if (!dirHandle) throw new Error('No directory handle provided');

  const data = polyDataToASCII(polyData);
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });

  try {
    // Create or get the file inside the directory
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });

    // Request permission for the file
    const granted = await ensureWritePermission(fileHandle);
    if (!granted) {
      throw new Error('Write permission denied for file');
    }

    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    console.log(`Saved ${filename} to chosen directory`);
    return true;
  } catch (err) {
    console.error('Failed to save file to directory', err);
    throw err;
  }
}
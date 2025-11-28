// Core operations for boundary detection and polyline tracing

import { a } from "@kitware/vtk.js/macros2";

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
        console.log('Found internal edge');
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
      const [p0, p1, rotation, cellId, apex] = edgePoints[h];
      boundaryEdges.push([p0, p1]);

      // Build adjacency map
      if (!adjacencyMap.has(p0)) adjacencyMap.set(p0, new Set());
      if (!adjacencyMap.has(p1)) adjacencyMap.set(p1, new Set());

      adjacencyMap.get(p0).add([p1, rotation, cellId, apex]);
      adjacencyMap.get(p1).add([p0, -rotation, cellId, apex]);
  }

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

      const [n1, rotation1, cellId1, apex1] = pack1;
      const [n2, rotation2, cellId2, apex2] = pack2;

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

export function traceBoundaryPolylinesOptimized(polyData, boundaryData, corners) {
  const { adjacencyMap } = boundaryData;
  const points = polyData.getPoints();
  const pointData = points.getData();

  const cornerIds = corners.map(c => c.pointId);
  const polylines = [];

  const neighborCells = new Map();

  // tracing down along the polyline
  const tracePolyline = (polyLine, adjacencyMap) => {

    // Last element
    const [neighborId,rotation, cellId, apexId] = polyLine[polyLine.length - 1];
    // Last point
    if (cornerIds.includes(neighborId) || adjacencyMap.get(neighborId).size !== 2)
    {
      return;
    }
    // It has more neighbors
    // First element
    adjacencyMap.get(neighborId).forEach(([n, r, c, a]) => {
      // n is the same as the previous element
      // Check if polyLine has at least 2 elements before accessing
      if (polyLine.length < 2) return;

      const prevId = polyLine[polyLine.length - 2][0];
      if (n === prevId || (neighborCells.has(c) && neighborCells.get(c)[a] === 1))
        return;

      if (!neighborCells.has(c))
      {
        const apex_ = [0, 0, 0];
        apex_[a] = 1;
        neighborCells.set(c, apex_);
      }
      else if (neighborCells.get(c)[a] === 0)
      {
        neighborCells.get(c)[a] = 1;
      }

      polyLine.push([n, r, c, a]);
      tracePolyline(polyLine, adjacencyMap);
    })

  }

  corners.forEach(corner => {
    const cornerId = corner.pointId;
    const neighbors = adjacencyMap.get(cornerId);
    // Multiple neighbors and loop over them
    Array.from(neighbors).forEach(([neighborId, rotation, cellId, apexId]) => {
      // The first element of polyLine is different - should be array of tuples
      const polyLine = [[cornerId, rotation, cellId, apexId]];
      // Never touched
      if (!neighborCells.has(cellId))
      {
        const apex_ = [0, 0, 0];
        apex_[apexId] = 1;
        neighborCells.set(cellId, apex_);
        polyLine.push([neighborId,rotation, cellId, apexId]);
        tracePolyline(polyLine, adjacencyMap);
        polylines.push(polyLine);
      }
      // Touch but different side
      else if (neighborCells.has(cellId) && neighborCells.get(cellId)[apexId] === 0)
      {
        const apex_ = neighborCells.get(cellId);
        apex_[apexId] = 1;
        neighborCells.set(cellId, apex_);
        polyLine.push([neighborId, rotation, cellId, apexId]);
        tracePolyline(polyLine, adjacencyMap);
        polylines.push(polyLine);
      }
      // Already touched
      else
      {
        return;
      }
    })
  })

  return polylines;
}

export function analyzePolylines(polylines) {
  // Sort by length for easier analysis
  return polylines.slice().sort((a, b) => b.euclideanLength - a.euclideanLength);
}

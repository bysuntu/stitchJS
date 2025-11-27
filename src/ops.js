// Core operations for boundary detection and polyline tracing

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
      const pt_min = Math.min(p0, p1);
      const pt_max = Math.max(p0, p1);
      const h = hash(pt_min, pt_max);

      const count = (edgeCount[h] || 0) + 1;
      edgeCount[h] = count;

      if (count === 1) {
        // First time seeing this edge - store it
        edgePoints[h] = [pt_min, pt_max];
      } else if (count === 2) {
        // Second time - it's internal, remove both entries
        delete edgeCount[h];
        delete edgePoints[h];
      }
    });

    /*
    // Process 3 edges of triangle
    let h = hash(Math.min(p0, p1), Math.max(p0, p1));
    edgeCount[h] = (edgeCount[h] || 0) + 1;
    if (edgeCount[h] === 1) edgePoints[h] = [Math.min(p0, p1), Math.max(p0, p1)];

    h = hash(Math.min(p1, p2), Math.max(p1, p2));
    edgeCount[h] = (edgeCount[h] || 0) + 1;
    if (edgeCount[h] === 1) edgePoints[h] = [Math.min(p1, p2), Math.max(p1, p2)];

    h = hash(Math.min(p2, p0), Math.max(p2, p0));
    edgeCount[h] = (edgeCount[h] || 0) + 1;
    if (edgeCount[h] === 1) edgePoints[h] = [Math.min(p2, p0), Math.max(p2, p0)];
    */
  }

  // Extract boundary edges and build adjacency map
  const boundaryEdges = [];
  const adjacencyMap = new Map();
  for (const h in edgeCount) {
      const [pt1, pt2] = edgePoints[h];
      boundaryEdges.push([pt1, pt2]);

      // Build adjacency map
      if (!adjacencyMap.has(pt1)) adjacencyMap.set(pt1, new Set());
      if (!adjacencyMap.has(pt2)) adjacencyMap.set(pt2, new Set());

      adjacencyMap.get(pt1).add(pt2);
      adjacencyMap.get(pt2).add(pt1);
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
    // Boundary corner must have exactly 2 neighbors
    if (neighbors.size !== 2) return;

    const [n1, n2] = Array.from(neighbors);

    // Get coordinates
    const px = pointData[pointId * 3];
    const py = pointData[pointId * 3 + 1];
    const pz = pointData[pointId * 3 + 2];

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
    const len1 = Math.sqrt(v1x*v1x + v1y*v1y + v1z*v1z);
    const len2 = Math.sqrt(v2x*v2x + v2y*v2y + v2z*v2z);

    if (len1 === 0 || len2 === 0) return;

    v1x /= len1; v1y /= len1; v1z /= len1;
    v2x /= len2; v2y /= len2; v2z /= len2;

    // Dot product
    const dot = v1x*v2x + v1y*v2y + v1z*v2z;

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
  });

  corners.sort((a, b) => a.angle - b.angle);
  return corners;
}

export function traceBoundaryPolylinesOptimized(polyData, boundaryData, corners) {
  const { adjacencyMap } = boundaryData;
  const points = polyData.getPoints();
  const pointData = points.getData();

  // Map corner IDs to corner objects for easy lookup
  const cornerMap = new Map(corners.map(c => [c.pointId, c]));

  // Track which edges have been used
  const usedEdges = new Set();
  const makeEdgeKey = (p1, p2) => p1 < p2 ? `${p1},${p2}` : `${p2},${p1}`;

  const polylines = [];

  // Process each corner
  for (const corner of corners) {
    const startId = corner.pointId;
    const neighbors = Array.from(adjacencyMap.get(startId) || []);

    if (neighbors.length !== 2) continue;

    // Trace both directions from corner
    for (const firstNeighbor of neighbors) {
      const startEdge = makeEdgeKey(startId, firstNeighbor);
      if (usedEdges.has(startEdge)) continue;

      // Build polyline
      const pointIds = [startId];
      const positions = [[
        pointData[startId * 3],
        pointData[startId * 3 + 1],
        pointData[startId * 3 + 2]
      ]];

      let prev = startId;
      let curr = firstNeighbor;
      usedEdges.add(startEdge);

      // Trace until hitting another corner
      while (curr !== undefined) {
        // Add current point
        pointIds.push(curr);
        positions.push([
          pointData[curr * 3],
          pointData[curr * 3 + 1],
          pointData[curr * 3 + 2]
        ]);

        // Check if we hit a corner
        if (cornerMap.has(curr)) break;

        // Get next point
        const currNeighbors = Array.from(adjacencyMap.get(curr) || []);
        if (currNeighbors.length !== 2) break;

        const next = currNeighbors[0] === prev ? currNeighbors[1] : currNeighbors[0];

        const edgeKey = makeEdgeKey(curr, next);
        if (usedEdges.has(edgeKey)) break;
        usedEdges.add(edgeKey);

        prev = curr;
        curr = next;
      }

      // Store polyline info
      if (pointIds.length >= 2) {
        const endId = pointIds[pointIds.length - 1];

        // Calculate euclidean length
        let euclideanLength = 0;
        for (let i = 1; i < positions.length; i++) {
          const dx = positions[i][0] - positions[i-1][0];
          const dy = positions[i][1] - positions[i-1][1];
          const dz = positions[i][2] - positions[i-1][2];
          euclideanLength += Math.sqrt(dx*dx + dy*dy + dz*dz);
        }

        polylines.push({
          pointIds,
          positions,
          startCorner: cornerMap.get(startId) || null,
          endCorner: cornerMap.get(endId) || null,
          numPoints: pointIds.length,
          isClosed: startId === endId,
          euclideanLength
        });
      }
    }
  }

  return polylines;
}

export function analyzePolylines(polylines) {
  // Sort by length for easier analysis
  return polylines.slice().sort((a, b) => b.euclideanLength - a.euclideanLength);
}

function detectBoundaryEdgesSTLWithAdjacency(polyData) {
  const cells = polyData.getPolys();
  const cellData = cells.getData();
  const numCells = polyData.getNumberOfPolys();
  
  // Edge counting
  const edgeCount = Object.create(null);
  const edgePoints = Object.create(null);
  
  // Hash function
  const hash = (a, b) => a >= b ? a * a + a + b : b * b + a;
  
  let offset = 0;
  
  // First pass: count edges
  for (let cellId = 0; cellId < numCells; cellId++) {
    offset++; // skip 3
    
    const p0 = cellData[offset++];
    const p1 = cellData[offset++];
    const p2 = cellData[offset++];
    
    // Process 3 edges
    let h = p0 < p1 ? hash(p0, p1) : hash(p1, p0);
    edgeCount[h] = (edgeCount[h] || 0) + 1;
    if (edgeCount[h] === 1) edgePoints[h] = p0 < p1 ? [p0, p1] : [p1, p0];
    
    h = p1 < p2 ? hash(p1, p2) : hash(p2, p1);
    edgeCount[h] = (edgeCount[h] || 0) + 1;
    if (edgeCount[h] === 1) edgePoints[h] = p1 < p2 ? [p1, p2] : [p2, p1];
    
    h = p2 < p0 ? hash(p2, p0) : hash(p0, p2);
    edgeCount[h] = (edgeCount[h] || 0) + 1;
    if (edgeCount[h] === 1) edgePoints[h] = p2 < p0 ? [p2, p0] : [p0, p2];
  }
  
  // Extract boundary edges and build adjacency map
  const boundaryEdges = [];
  const adjacencyMap = new Map(); // Map<int, Set<int>> - like std::map<int, std::list<int>>
  
  for (const h in edgeCount) {
    if (edgeCount[h] === 1) {
      const [pt1, pt2] = edgePoints[h];
      boundaryEdges.push([pt1, pt2]);
      
      // Build adjacency map
      if (!adjacencyMap.has(pt1)) adjacencyMap.set(pt1, new Set());
      if (!adjacencyMap.has(pt2)) adjacencyMap.set(pt2, new Set());
      
      adjacencyMap.get(pt1).add(pt2);
      adjacencyMap.get(pt2).add(pt1);
    }
  }
  
  return { boundaryEdges, adjacencyMap };
}

function detectSharpCornersWithMap(polyData, boundaryData, angleThreshold = 30) {
  const { boundaryEdges, adjacencyMap } = boundaryData;
  const points = polyData.getPoints();
  const pointData = points.getData();
  
  const corners = [];
  const cosThreshold = Math.cos(angleThreshold * Math.PI / 180);
  
  // Iterate through boundary points
  adjacencyMap.forEach((neighbors, pointId) => {
    // Boundary corner must have exactly 2 neighbors
    if (neighbors.size !== 2) return;
    
    const [n1, n2] = Array.from(neighbors);
    
    // Get coordinates (flat indexing)
    const px = pointData[pointId * 3];
    const py = pointData[pointId * 3 + 1];
    const pz = pointData[pointId * 3 + 2];
    
    const p1x = pointData[n1 * 3];
    const p1y = pointData[n1 * 3 + 1];
    const p1z = pointData[n1 * 3 + 2];
    
    const p2x = pointData[n2 * 3];
    const p2y = pointData[n2 * 3 + 1];
    const p2z = pointData[n2 * 3 + 2];
    
    // Vectors
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
    
    // Check if sharp
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

function traceBoundaryPolylines(polyData, boundaryData, corners) {
  const { adjacencyMap } = boundaryData;
  const points = polyData.getPoints();
  const pointData = points.getData();
  
  // Create set of corner point IDs for fast lookup
  const cornerSet = new Set(corners.map(c => c.pointId));
  
  // Track visited edges to avoid duplicates
  const visitedEdges = new Set();
  const edgeKey = (p1, p2) => p1 < p2 ? `${p1}-${p2}` : `${p2}-${p1}`;
  
  const polylines = [];
  
  // Start from each corner
  corners.forEach(corner => {
    const startPoint = corner.pointId;
    const neighbors = adjacencyMap.get(startPoint);
    
    if (!neighbors || neighbors.length !== 2) return;
    
    // Trace in both directions from this corner
    neighbors.forEach(firstNeighbor => {
      const edgeId = edgeKey(startPoint, firstNeighbor);
      
      // Skip if already traced this edge
      if (visitedEdges.has(edgeId)) return;
      
      // Trace polyline from startPoint through firstNeighbor until hitting another corner
      const polyline = [startPoint];
      let current = firstNeighbor;
      let previous = startPoint;
      
      visitedEdges.add(edgeKey(previous, current));
      
      // Keep tracing until we hit a corner or dead end
      while (current !== undefined && !cornerSet.has(current)) {
        polyline.push(current);
        
        const currentNeighbors = adjacencyMap.get(current);
        if (!currentNeighbors || currentNeighbors.length !== 2) break;
        
        // Find next point (the neighbor that isn't where we came from)
        const next = currentNeighbors[0] === previous ? currentNeighbors[1] : currentNeighbors[0];
        
        // Mark edge as visited
        const nextEdgeId = edgeKey(current, next);
        if (visitedEdges.has(nextEdgeId)) break;
        visitedEdges.add(nextEdgeId);
        
        previous = current;
        current = next;
      }
      
      // Add the ending corner point
      if (current !== undefined && cornerSet.has(current)) {
        polyline.push(current);
      }
      
      // Only add valid polylines (at least 2 points)
      if (polyline.length >= 2) {
        // Get 3D coordinates
        const positions = polyline.map(ptId => [
          pointData[ptId * 3],
          pointData[ptId * 3 + 1],
          pointData[ptId * 3 + 2]
        ]);
        
        polylines.push({
          pointIds: polyline,
          positions: positions,
          startCorner: polyline[0],
          endCorner: polyline[polyline.length - 1],
          length: polyline.length
        });
      }
    });
  });
  
  return polylines;
}

function traceBoundaryPolylinesOptimized(polyData, boundaryData, corners) {
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
    const neighbors = adjacencyMap.get(startId);
    
    if (!neighbors || neighbors.length !== 2) continue;
    
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
        const currNeighbors = adjacencyMap.get(curr);
        if (!currNeighbors || currNeighbors.length !== 2) break;
        
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
        
        polylines.push({
          pointIds,
          positions,
          startCorner: cornerMap.get(startId) || null,
          endCorner: cornerMap.get(endId) || null,
          numPoints: pointIds.length,
          isClosed: startId === endId
        });
      }
    }
  }
  
  return polylines;
}


// Single call to get both boundaries and adjacency
const boundaryData = detectBoundaryEdgesSTLWithAdjacency(polyData);

console.log(`Found ${boundaryData.boundaryEdges.length} boundary edges`);
console.log(`Adjacency map has ${boundaryData.adjacencyMap.size} boundary points`);

// Use adjacency map for fast corner detection
const corners = detectSharpCornersWithMap(polyData, boundaryData, 30);
console.log(`Found ${corners.length} sharp corners`);

// Access adjacency directly if needed
const pointId = 123;
if (boundaryData.adjacencyMap.has(pointId)) {
  const neighbors = boundaryData.adjacencyMap.get(pointId);
  console.log(`Point ${pointId} has ${neighbors.size} boundary neighbors:`, Array.from(neighbors));
}


async function processSTLWithPolylines(stlFile) {
  // Load STL
  const reader = vtkSTLReader.newInstance();
  const arrayBuffer = await stlFile.arrayBuffer();
  reader.parseAsArrayBuffer(arrayBuffer);
  const polyData = reader.getOutputData();
  
  console.log('Step 1: Detecting boundaries...');
  const boundaryData = detectBoundaryEdgesSTLWithAdjacency(polyData);
  console.log(`  Found ${boundaryData.boundaryEdges.length} boundary edges`);
  
  console.log('Step 2: Detecting corners...');
  const corners = detectSharpCornersWithMap(polyData, boundaryData, 30);
  console.log(`  Found ${corners.length} corners`);
  
  console.log('Step 3: Tracing polylines...');
  const polylines = traceBoundaryPolylinesOptimized(polyData, boundaryData, corners);
  console.log(`  Created ${polylines.length} polylines`);
  
  // Analyze
  const analyzed = analyzePolylines(polylines);
  
  // Show some details
  console.log('\nTop 5 longest polylines:');
  analyzed.slice(0, 5).forEach((pl, i) => {
    console.log(`  ${i+1}. Length: ${pl.euclideanLength.toFixed(2)}, Points: ${pl.numPoints}`);
  });
  
  return { polyData, boundaryData, corners, polylines: analyzed };
}

// Usage
const results = await processSTLWithPolylines(stlFile);
visualizePolylines(results.polylines, renderer);
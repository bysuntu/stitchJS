# Slit Stitching Algorithm

## Overview

The `stitchEdge` function repairs mesh "slits" - situations where two boundary polylines are very close to each other but not conformally connected (don't share vertices). This is common in imported CAD models or meshes that have been split.

## Algorithm Design

### Core Principle

**No point merging during stitching** - the algorithm only rebuilds cell connectivity. Split points already exist in the global point array (from the opposite polyline), so we just reference them correctly in new triangles.

### Three-Step Process

---

## Step 1: Group Polylines by Shared Endpoints

**Purpose**: Identify candidate polyline pairs that might form a slit.

**Implementation**:
```javascript
const polyLineMap = new Map();
polyLineArray.forEach((polyLine, idx) => {
  const first_element = polyLine[0];
  const last_element = polyLine[polyLine.length - 1];
  const first_id = Math.min(first_element[0], last_element[0]);
  const last_id = Math.max(first_element[0], last_element[0]);
  const key = `${first_id}-${last_id}`;

  if (!polyLineMap.has(key)) {
    polyLineMap.set(key, [idx]);
  } else {
    polyLineMap.get(key).push(idx);
  }
});
```

**Data Structure**:
- **Key**: `"minPointId-maxPointId"` (normalized endpoint pair)
- **Value**: Array of polyline indices sharing these endpoints

**Rationale**: A slit typically consists of two polylines that:
- Share the same start and end points (endpoints match)
- Run very close to each other (within tolerance)
- Have non-conformal internal points (points don't align)

---

## Step 2: Detect Projection Points

**Purpose**: For each polyline pair with matching endpoints, find where internal points from one polyline project onto the edges of triangles adjacent to the other polyline.

**Implementation**:
```javascript
const stitchMap = new Map();
polyLineMap.forEach((indexArray, key) => {
  indexArray.forEach((polyLineIdx, idx) => {
    const currentPolyLine = polyLineArray[polyLineIdx];
    indexArray.shift(); // Remove current to avoid duplicate comparisons
    indexArray.forEach(otherIndex => {
      const otherPolyLine = polyLineArray[otherIndex];
      distanceBetweenTwoPolyLines(currentPolyLine, otherPolyLine, stitchMap, tolerance);
    });
  });
});
```

**Helper Function**: `distanceBetweenTwoPolyLines`

1. Extract internal points from polyLine1 (exclude endpoints):
   ```javascript
   const internals1 = polyLine1.slice(1, -1);
   ```

2. Extract edge segments from polyLine2:
   - Each polyline element contains `[cellId, sideId]` - which triangle and which edge
   - Gets the two vertices forming that edge

3. Project each internal point onto each segment:
   ```javascript
   const { distance, t } = point2SegmentDistance(point, segment, tolerance);
   if (distance <= tolerance && t >= 0 && t <= 1) {
     cellMap.get(cellId)[sideId].add([t, pointId]);
   }
   ```
   - Only record if point is close enough (≤ tolerance)
   - AND projects onto the segment interior (0 ≤ t ≤ 1)
   - Records: which triangle (cellId), which edge (sideId), position (t), and point (pointId)

**Data Structure**: `stitchMap`
```javascript
Map {
  cellId => [Set(), Set(), Set()],  // One Set per triangle side (0, 1, 2)
}
```

Each Set contains `[t, pointId]` pairs:
- `t`: Parametric position on edge (0.0 = start vertex, 1.0 = end vertex, 0.5 = midpoint)
- `pointId`: Global point ID from opposite polyline that projects here

**Example**:
```javascript
stitchMap = Map {
  42 => [
    Set(),              // side 0: no projections
    Set([              // side 1: two points project here
      [0.3, 156],      //   - point 156 at 30% along edge
      [0.7, 189]       //   - point 189 at 70% along edge
    ]),
    Set()              // side 2: no projections
  ]
}
```

This tells us triangle 42's edge 1 needs splitting at two locations.

---

## Step 3: Rebuild Cell Array with Triangulation

**Purpose**: Reconstruct the mesh by replacing marked triangles with retriangulated versions that incorporate split points.

### Algorithm:

#### 3.1 Preserve Unchanged Cells
```javascript
const cells = polyData.getPolys();
const cellData = cells.getData();
const numCells = polyData.getNumberOfPolys();
const newCellData = [];

for (let cellId = 0; cellId < numCells; cellId++) {
  if (!stitchMap.has(cellId)) {
    // Copy unchanged cell to new array
    const cellOffset = cells.getCellOffset(cellId);
    const numPoints = cellData[cellOffset];
    for (let i = 0; i <= numPoints; i++) {
      newCellData.push(cellData[cellOffset + i]);
    }
  }
}
```

#### 3.2 Retriangulate Marked Cells

For each `cellId` in `stitchMap`:

**A. Build Local Point Set**
```javascript
const originalPoints = cells.getCellPoints(cellId); // [v0, v1, v2]
const localPoints = [...originalPoints];
const pointMap = new Map();

// Map original vertices
pointMap.set(0, originalPoints[0]); // local 0 → global v0
pointMap.set(1, originalPoints[1]); // local 1 → global v1
pointMap.set(2, originalPoints[2]); // local 2 → global v2

let localId = 3;
```

**B. Add Split Points from Each Side**
```javascript
const splitSets = stitchMap.get(cellId); // [Set(), Set(), Set()]

splitSets.forEach((splitSet, sideId) => {
  if (splitSet.size > 0) {
    // Sort by parameter t along edge
    const sortedSplits = Array.from(splitSet).sort((a, b) => a[0] - b[0]);

    sortedSplits.forEach(([t, globalPointId]) => {
      pointMap.set(localId, globalPointId);
      localPoints.push(localId);
      localId++;
    });
  }
});
```

**C. Triangulate Locally**

Use constrained triangulation (Delaunay with constraints) or simple ear-clipping:
```javascript
const localTriangles = triangulatePolygon(localPoints, splitSets);
// Returns: [[0, 1, 3], [1, 2, 3], [2, 0, 4], ...]
```

**D. Convert to Global IDs and Append**
```javascript
localTriangles.forEach(([a, b, c]) => {
  newCellData.push(3);  // Triangle has 3 points
  newCellData.push(pointMap.get(a));
  newCellData.push(pointMap.get(b));
  newCellData.push(pointMap.get(c));
});
```

#### 3.3 Update PolyData
```javascript
const newCells = vtkCellArray.newInstance();
newCells.setData(Uint32Array.from(newCellData));
polyData.setPolys(newCells);
polyData.modified();
```

---

## Key Design Insights

### 1. Why No Point Merging?

The **points array remains unchanged** throughout stitching. Split points already exist as global points (from the opposite polyline). We only need to:
- Reference them in new triangles via `pointId`
- Build local → global mapping via `pointMap`

This avoids:
- Expensive point cloud operations
- Coordinate transformations
- Tolerance-based merging issues

### 2. Why Local Triangulation?

Each marked triangle is retriangulated **independently** in its own local coordinate system:
- **Input**: 3 original vertices + N split points
- **Output**: M new triangles covering the same area
- **Mapping**: `pointMap` converts local IDs → global IDs

Benefits:
- Simpler triangulation algorithms (work in 2D)
- No global topology concerns during triangulation
- Easy to validate each cell independently

### 3. Why Parameter t?

The parameter `t ∈ [0, 1]` gives the **exact position** along an edge:
- `t = 0.0` → First vertex
- `t = 0.5` → Edge midpoint
- `t = 1.0` → Second vertex

This enables:
- Sorting multiple splits on same edge
- Preserving geometric accuracy
- Easy interpolation of attributes (normals, UVs, etc.)

### 4. Efficiency Gains

**Grouping by endpoints** (Step 1) reduces complexity:
- Without grouping: O(n²) comparisons for n polylines
- With grouping: Only compare polylines in same group
- Typical slit: 2 polylines per group → O(1) comparisons per group

---

## Data Flow Summary

```
Input: polyData + polyLineArray
  ↓
Step 1: Group by endpoints
  → polyLineMap: endpoints → [polyline indices]
  ↓
Step 2: Detect projections
  → stitchMap: cellId → [split points per side]
  ↓
Step 3: Rebuild cells
  ├→ Copy unchanged cells
  ├→ Retriangulate marked cells
  │  ├→ Build local point set + pointMap
  │  ├→ Triangulate locally
  │  └→ Convert to global IDs
  └→ Update polyData.polys
  ↓
Output: Modified polyData (points unchanged, cells updated)
```

---

## Limitations and Future Work

### Current Implementation Status
- ✅ Step 1: Complete (grouping by endpoints)
- ✅ Step 2: Complete (projection detection)
- ⚠️ Step 3: **Not implemented** (needs triangulation logic)

### Known Issues
1. **`distanceBetweenTwoPolyLines` bugs**:
   - `polyData` not passed as parameter (relies on parent scope)
   - `extractPoints` function doesn't return anything
   - These must be fixed before Step 3 implementation

2. **Missing triangulation algorithm**:
   - Need to implement constrained Delaunay or ear-clipping
   - Must handle degenerate cases (collinear points, etc.)

3. **No validation**:
   - Should check if stitchMap is empty
   - Should validate triangle quality after retriangulation
   - Should handle edge cases (split point too close to vertex)

### Potential Enhancements
- Support for quad meshes (not just triangles)
- Attribute interpolation (normals, UVs) at split points
- Quality metrics for retriangulated cells
- Undo/redo support
- Performance optimization for large meshes

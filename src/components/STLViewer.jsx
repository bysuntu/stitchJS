import { useEffect, useState, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { removeDuplicatePoints } from '../mergePoints';
import { threeToPolyData } from '../geometryAdapter';
import {
  detectBoundaryEdgesSTLWithAdjacency,
  detectSharpCornersWithMap,
  detechBoundaryPolylines,
  analyzePolylines
} from '../ops';
import { RENDER_ORDER, POLYGON_OFFSET, GEOMETRY_TOLERANCES } from '../renderConfig';

// Helper function to remove degenerate cells (same as VTK version)
function removeDegenerateCells(polyData) {
  const cells = polyData.getPolys();
  const cellData = cells.getData();
  const numCells = polyData.getNumberOfPolys();
  const points = polyData.getPoints();
  const pointData = points.getData();

  const validCells = [];
  let offset = 0;
  let duplicateCount = 0;
  let smallAreaCount = 0;
  let tinyEdgeCount = 0;

  for (let cellId = 0; cellId < numCells; cellId++) {
    const numPts = cellData[offset];
    const pts = [];
    for (let i = 0; i < numPts; i++) {
      pts.push(cellData[offset + 1 + i]);
    }

    // Check if triangle has duplicate vertices
    const hasDuplicates = pts[0] === pts[1] || pts[1] === pts[2] || pts[0] === pts[2];

    // Check for degenerate triangles (small area or tiny edges)
    let isDegenerate = false;
    if (!hasDuplicates && numPts === 3) {
      const v0 = [pointData[pts[0]*3], pointData[pts[0]*3+1], pointData[pts[0]*3+2]];
      const v1 = [pointData[pts[1]*3], pointData[pts[1]*3+1], pointData[pts[1]*3+2]];
      const v2 = [pointData[pts[2]*3], pointData[pts[2]*3+1], pointData[pts[2]*3+2]];

      const edge1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
      const edge2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
      const edge3 = [v2[0]-v1[0], v2[1]-v1[1], v2[2]-v1[2]];

      // Calculate edge lengths
      const len1 = Math.sqrt(edge1[0]*edge1[0] + edge1[1]*edge1[1] + edge1[2]*edge1[2]);
      const len2 = Math.sqrt(edge2[0]*edge2[0] + edge2[1]*edge2[1] + edge2[2]*edge2[2]);
      const len3 = Math.sqrt(edge3[0]*edge3[0] + edge3[1]*edge3[1] + edge3[2]*edge3[2]);

      // Check for tiny edges
      if (len1 < GEOMETRY_TOLERANCES.MIN_EDGE_LENGTH ||
          len2 < GEOMETRY_TOLERANCES.MIN_EDGE_LENGTH ||
          len3 < GEOMETRY_TOLERANCES.MIN_EDGE_LENGTH) {
        isDegenerate = true;
        tinyEdgeCount++;
      } else {
        // Calculate triangle area using cross product
        const cross = [
          edge1[1]*edge2[2] - edge1[2]*edge2[1],
          edge1[2]*edge2[0] - edge1[0]*edge2[2],
          edge1[0]*edge2[1] - edge1[1]*edge2[0]
        ];
        const crossMag = Math.sqrt(cross[0]*cross[0] + cross[1]*cross[1] + cross[2]*cross[2]);
        const area = 0.5 * crossMag;

        // Check if area is too small
        if (area < GEOMETRY_TOLERANCES.MIN_TRIANGLE_AREA) {
          isDegenerate = true;
          smallAreaCount++;
        }
      }
    }

    if (hasDuplicates) {
      duplicateCount++;
    } else if (!isDegenerate) {
      validCells.push(numPts, ...pts);
    }

    offset += numPts + 1;
  }

  console.log(`Removed degenerate triangles: ${duplicateCount} with duplicate vertices, ${smallAreaCount} with area < ${GEOMETRY_TOLERANCES.MIN_TRIANGLE_AREA.toExponential(2)}, ${tinyEdgeCount} with tiny edges`);

  const newPolyData = vtkPolyData.newInstance();
  newPolyData.setPoints(points);
  const newCells = vtkCellArray.newInstance();
  newCells.setData(Uint32Array.from(validCells));
  newPolyData.setPolys(newCells);

  return newPolyData;
}

// Helper function to convert VTK polyData to Three.js geometry
function polyDataToThreeGeometry(polyData) {
  const points = polyData.getPoints();
  const pointData = points.getData();
  const cells = polyData.getPolys();
  const cellData = cells.getData();

  // Extract indices
  const indices = [];
  let offset = 0;
  const numCells = polyData.getNumberOfPolys();

  for (let i = 0; i < numCells; i++) {
    const numPts = cellData[offset++];
    for (let j = 0; j < numPts; j++) {
      indices.push(cellData[offset++]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pointData), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function STLViewer({ stlFile, settings, shouldProcess, onGeometryLoaded, onProcess, playback, onPolyDataCleaned }) {
  const [geometry, setGeometry] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const meshMaterialRef = useRef();

  // Load STL file and prepare geometry (but don't process yet)
  useEffect(() => {
    if (!stlFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const loader = new STLLoader();
      const geometry = loader.parse(e.target.result);

      // Process geometry using VTK.js methods (same as VTK version)
      console.log('Loaded STL:', geometry.attributes.position.count, 'points');

      // Convert Three.js geometry to VTK polyData
      const rawPolyData = threeToPolyData(geometry);

      // Step 1: Merge exact duplicates (tolerance = 0)
      const cleanPolyData = removeDuplicatePoints(rawPolyData, 0);
      console.log('After exact duplicate removal:', cleanPolyData.getNumberOfPoints(), 'points');

      // Step 2: Apply proximity-based merging
      const proximityTolerance = settings.proximityTolerance || 1e-5;
      const mergedPolyData = removeDuplicatePoints(cleanPolyData, proximityTolerance);
      console.log('After proximity merging (tolerance:', proximityTolerance + '):', mergedPolyData.getNumberOfPoints(), 'points');

      // Step 3: Remove degenerate triangles
      const finalPolyData = removeDegenerateCells(mergedPolyData);
      console.log('After removing degenerate cells:', finalPolyData.getNumberOfPoints(), 'points', finalPolyData.getNumberOfPolys(), 'cells');

      // Convert back to Three.js geometry
      const processedGeometry = polyDataToThreeGeometry(finalPolyData);

      setGeometry(processedGeometry);
      setProcessedData(null);
      onGeometryLoaded(processedGeometry);
      onPolyDataCleaned(finalPolyData);
    };

    reader.readAsArrayBuffer(stlFile);
  }, [stlFile, settings.proximityTolerance, onGeometryLoaded]);

  // Process boundary detection only when shouldProcess is true
  useEffect(() => {
    if (!geometry || !shouldProcess) return;

    console.log('Processing boundaries...');

    // Convert to polyData format for algorithms
    const polyData = threeToPolyData(geometry);

    // Detect boundaries
    const boundaryData = detectBoundaryEdgesSTLWithAdjacency(polyData);
    console.log(`Found ${boundaryData.boundaryEdges.length} boundary edges`);

    // Detect corners
    const corners = detectSharpCornersWithMap(polyData, boundaryData, settings.angleThreshold);
    console.log(`Found ${corners.length} corners`);

    // Trace polylines
    const { polylines, polyLineArray } = detechBoundaryPolylines(polyData, boundaryData, corners);
    console.log(`Created ${polylines.length} polylines`);

    // Analyze and sort
    const sortedPolylines = analyzePolylines(polylines);

    const data = {
      geometry,
      boundaryData,
      corners,
      polylines: sortedPolylines,
      polyLineArray,
      numVertices: geometry.attributes.position.count,
      numTriangles: geometry.index.count / 3,
    };

    setProcessedData(data);
    onProcess(data);
  }, [shouldProcess, geometry, settings.angleThreshold, onProcess]);

  // Update material when flat shading changes
  useEffect(() => {
    if (meshMaterialRef.current) {
      meshMaterialRef.current.flatShading = settings.flatShading;
      meshMaterialRef.current.needsUpdate = true;
    }
  }, [settings.flatShading]);

  // Update mesh material opacity on every frame
  useFrame(() => {
    if (meshMaterialRef.current) {
      if (meshMaterialRef.current.opacity !== settings.meshOpacity) {
        meshMaterialRef.current.opacity = settings.meshOpacity;
        meshMaterialRef.current.transparent = true;
        meshMaterialRef.current.depthWrite = settings.meshOpacity >= 1;
        meshMaterialRef.current.needsUpdate = true;
      }
    }
  });

  return (
    <>
      {/* Main Mesh - Show even before processing - Lowest priority */}
      {settings.showMesh && geometry && (
        <mesh geometry={geometry} renderOrder={RENDER_ORDER.MESH}>
          <meshStandardMaterial
            ref={meshMaterialRef}
            color={settings.meshColor}
            opacity={settings.meshOpacity}
            transparent={true}
            side={THREE.DoubleSide}
            depthTest={true}
            depthWrite={settings.meshOpacity >= 1}
            flatShading={settings.flatShading}
          />
        </mesh>
      )}

      {/* Wireframe - Show even before processing - Third priority (3) */}
      {settings.showWireframe && geometry && (
        <Wireframe geometry={geometry} color={settings.wireframeColor} />
      )}

      {/* Processed data visualization - only show after processing */}
      {processedData && (
        <>
          {/* Boundary Edges */}
          {settings.showBoundary && (
            <BoundaryEdges
              boundaryData={processedData.boundaryData}
              geometry={processedData.geometry}
              color={settings.boundaryColor}
            />
          )}

          {/* Corners - Highest priority when enabled */}
          {settings.showCorners && (
            <Corners
              corners={processedData.corners}
              geometry={processedData.geometry}
              color={settings.cornerColor}
            />
          )}

          {/* Polylines - Second highest priority */}
          {settings.showPolylines && processedData.polylines && (
            <Polylines
              polylines={processedData.polylines}
              geometry={processedData.geometry}
              color={settings.polylineColor}
              currentIndex={playback.currentIndex}
            />
          )}
        </>
      )}
    </>
  );
}

// Boundary Edges Component
function BoundaryEdges({ boundaryData, geometry, color }) {
  const positions = geometry.attributes.position.array;

  const points = useMemo(() => {
    const pts = [];
    boundaryData.boundaryEdges.forEach(([p0, p1]) => {
      pts.push(
        positions[p0 * 3], positions[p0 * 3 + 1], positions[p0 * 3 + 2],
        positions[p1 * 3], positions[p1 * 3 + 1], positions[p1 * 3 + 2]
      );
    });
    return new Float32Array(pts);
  }, [boundaryData, positions]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length / 3}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} linewidth={2} />
    </lineSegments>
  );
}

// Corners Component
function Corners({ corners, geometry, color }) {
  const positions = geometry.attributes.position.array;

  return (
    <group>
      {corners.map((corner, idx) => (
        <mesh
          key={idx}
          position={[
            positions[corner.pointId * 3],
            positions[corner.pointId * 3 + 1],
            positions[corner.pointId * 3 + 2]
          ]}
          renderOrder={RENDER_ORDER.CORNERS}
        >
          <sphereGeometry args={[0.01, 8, 8]} />
          <meshBasicMaterial
            color={color}
            depthTest={true}
            depthWrite={true}
            polygonOffset={true}
            polygonOffsetFactor={POLYGON_OFFSET.CORNERS.factor}
            polygonOffsetUnits={POLYGON_OFFSET.CORNERS.units}
          />
        </mesh>
      ))}
    </group>
  );
}

// Polylines Component
function Polylines({ polylines, geometry, color, currentIndex }) {
  const positions = geometry.attributes.position.array;

  if (currentIndex < 0 || currentIndex >= polylines.length) return null;

  const polyline = polylines[currentIndex];

  // Build polyline geometry
  const lineGeometry = useMemo(() => {
    const pts = [];
    polyline.positions.forEach(([x, y, z]) => {
      pts.push(x, y, z);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return geo;
  }, [currentIndex, polyline.positions]);

  // Build highlighted cells geometry
  const cellGeometry = useMemo(() => {
    const triangles = [];

    polyline.cellDetails.forEach(cell => {
      const [i0, i1, i2] = cell.pointIds;
      triangles.push(
        positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2],
        positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2],
        positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]
      );
    });

    if (triangles.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(triangles), 3));
    return geo;
  }, [currentIndex, polyline.cellDetails, positions]);

  // Cleanup geometries on unmount or when they change
  useEffect(() => {
    return () => {
      if (lineGeometry) lineGeometry.dispose();
      if (cellGeometry) cellGeometry.dispose();
    };
  }, [lineGeometry, cellGeometry]);

  return (
    <group key={`polyline-${currentIndex}`}>
      {/* Polyline - Second highest */}
      <line key={`line-${currentIndex}`} geometry={lineGeometry} renderOrder={RENDER_ORDER.POLYLINE_LINE}>
        <lineBasicMaterial
          color={color}
          linewidth={4}
          depthTest={true}
          depthWrite={true}
          polygonOffset={true}
          polygonOffsetFactor={POLYGON_OFFSET.POLYLINE_LINE.factor}
          polygonOffsetUnits={POLYGON_OFFSET.POLYLINE_LINE.units}
        />
      </line>

      {/* Highlighted Cells (Facets) - Highest priority - Always fully opaque */}
      {cellGeometry && (
        <mesh key={`mesh-${currentIndex}`} geometry={cellGeometry} renderOrder={RENDER_ORDER.POLYLINE_FACETS}>
          <meshBasicMaterial
            color="#0088ff"
            opacity={1.0}
            transparent={false}
            side={THREE.DoubleSide}
            depthTest={true}
            depthWrite={true}
            polygonOffset={true}
            polygonOffsetFactor={POLYGON_OFFSET.POLYLINE_FACETS.factor}
            polygonOffsetUnits={POLYGON_OFFSET.POLYLINE_FACETS.units}
          />
        </mesh>
      )}
    </group>
  );
}

// Wireframe Component
function Wireframe({ geometry, color }) {
  const wireframeGeometry = useMemo(() => {
    const wireGeo = new THREE.WireframeGeometry(geometry);
    return wireGeo;
  }, [geometry]);

  return (
    <>
      {/* First pass: Render wireframe to depth buffer only */}
      <lineSegments geometry={wireframeGeometry} renderOrder={RENDER_ORDER.WIREFRAME}>
        <lineBasicMaterial
          colorWrite={false} // Don't write to color buffer
          depthWrite={true}  // Write to depth buffer
          depthTest={true}
          polygonOffset={true}
          polygonOffsetFactor={-1.0}
          polygonOffsetUnits={-1.0}
        />
      </lineSegments>
      {/* Second pass: Render visible wireframe without depth test */}
      <lineSegments geometry={wireframeGeometry} renderOrder={RENDER_ORDER.WIREFRAME + 0.1}>
        <lineBasicMaterial
          color={color}
          linewidth={1}
          depthTest={false} // Render on top
          depthWrite={false}
        />
      </lineSegments>
    </>
  );
}

export default STLViewer;

import React, { useEffect, useState, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';
import { mergePoints, removeDegenerateCells } from '../mergePointsThree';
import { threeToPolyData } from '../geometryAdapter';
import {
  detectBoundaryEdgesSTLWithAdjacency,
  detectSharpCornersWithMap,
  detechBoundaryPolylines,
  analyzePolylines
} from '../ops';

function STLViewer({ stlFile, settings, shouldProcess, onGeometryLoaded, onProcess, playback }) {
  const [geometry, setGeometry] = useState(null);
  const [processedData, setProcessedData] = useState(null);

  // Load STL file and prepare geometry (but don't process yet)
  useEffect(() => {
    if (!stlFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const loader = new STLLoader();
      const geometry = loader.parse(e.target.result);

      // Process geometry: exact merge → proximity merge → remove degenerates
      console.log('Loaded STL:', geometry.attributes.position.count, 'points');

      // Step 1: Exact duplicate removal
      const exactMerged = mergePoints(geometry, 0);
      console.log('After exact duplicate removal:', exactMerged.attributes.position.count, 'points');

      // Step 2: Proximity-based merging
      const proximityMerged = mergePoints(exactMerged, settings.proximityTolerance);
      console.log('After proximity merging:', proximityMerged.attributes.position.count, 'points');

      // Step 3: Remove degenerate cells
      const cleanGeometry = removeDegenerateCells(proximityMerged);
      console.log('After removing degenerate cells:', cleanGeometry.attributes.position.count, 'points');

      setGeometry(cleanGeometry);
      setProcessedData(null);
      onGeometryLoaded(cleanGeometry);
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
    const polylines = detechBoundaryPolylines(polyData, boundaryData, corners);
    console.log(`Created ${polylines.length} polylines`);

    // Analyze and sort
    const sortedPolylines = analyzePolylines(polylines);

    const data = {
      geometry,
      boundaryData,
      corners,
      polylines: sortedPolylines,
      numVertices: geometry.attributes.position.count,
      numTriangles: geometry.index.count / 3,
    };

    setProcessedData(data);
    onProcess(data);
  }, [shouldProcess, geometry, settings.angleThreshold, onProcess]);

  return (
    <>
      {/* Main Mesh - Show even before processing */}
      {settings.showMesh && geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial
            color={settings.meshColor}
            opacity={settings.meshOpacity}
            transparent={settings.meshOpacity < 1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Wireframe - Show even before processing */}
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

          {/* Corners */}
          {settings.showCorners && (
            <Corners
              corners={processedData.corners}
              geometry={processedData.geometry}
              color={settings.cornerColor}
            />
          )}

          {/* Polylines */}
          {settings.showPolylines && processedData.polylines && (
            <Polylines
              polylines={processedData.polylines}
              geometry={processedData.geometry}
              color={settings.polylineColor}
              currentIndex={playback.currentIndex}
              cellOpacity={settings.cellOpacity}
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
        >
          <sphereGeometry args={[0.01, 8, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

// Polylines Component
function Polylines({ polylines, geometry, color, currentIndex, cellOpacity }) {
  const positions = geometry.attributes.position.array;
  const indices = geometry.index.array;

  if (currentIndex < 0 || currentIndex >= polylines.length) return null;

  const polyline = polylines[currentIndex];

  // Build polyline geometry
  const linePoints = useMemo(() => {
    const pts = [];
    polyline.positions.forEach(([x, y, z]) => {
      pts.push(x, y, z);
    });
    return new Float32Array(pts);
  }, [polyline]);

  // Build highlighted cells geometry
  const cellTriangles = useMemo(() => {
    const triangles = [];

    polyline.cellDetails.forEach(cell => {
      const [i0, i1, i2] = cell.pointIds;
      triangles.push(
        positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2],
        positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2],
        positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]
      );
    });

    return new Float32Array(triangles);
  }, [polyline, positions]);

  return (
    <group>
      {/* Polyline */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={linePoints.length / 3}
            array={linePoints}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} linewidth={4} />
      </line>

      {/* Highlighted Cells */}
      {cellTriangles.length > 0 && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={cellTriangles.length / 3}
              array={cellTriangles}
              itemSize={3}
            />
          </bufferGeometry>
          <meshBasicMaterial
            color="#0088ff"
            opacity={cellOpacity}
            transparent={cellOpacity < 1}
            side={THREE.DoubleSide}
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
    <lineSegments geometry={wireframeGeometry}>
      <lineBasicMaterial color={color} linewidth={1} />
    </lineSegments>
  );
}

export default STLViewer;

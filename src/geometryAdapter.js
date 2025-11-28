// Adapter to convert between Three.js BufferGeometry and vtk.js-style data format
// This allows our existing algorithms to work with Three.js geometry

import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';

/**
 * Convert Three.js BufferGeometry to vtk.js polyData format
 * @param {THREE.BufferGeometry} geometry - Three.js geometry
 * @returns {vtkPolyData} - Real vtk.js polyData object
 */
export function threeToPolyData(geometry) {
  // Ensure geometry is indexed
  if (!geometry.index) {
    geometry = geometry.toNonIndexed();
  }

  const positions = geometry.attributes.position.array;
  const indices = geometry.index ? geometry.index.array : null;

  // Build cell data in vtk.js format: [numPts, idx0, idx1, idx2, numPts, idx3, idx4, idx5, ...]
  const cellData = [];

  if (indices) {
    // Indexed geometry
    for (let i = 0; i < indices.length; i += 3) {
      cellData.push(3, indices[i], indices[i + 1], indices[i + 2]);
    }
  } else {
    // Non-indexed geometry
    const numTriangles = positions.length / 9; // 3 vertices * 3 components
    for (let i = 0; i < numTriangles; i++) {
      const baseIdx = i * 3;
      cellData.push(3, baseIdx, baseIdx + 1, baseIdx + 2);
    }
  }

  // Create real VTK polyData instance
  const polyData = vtkPolyData.newInstance();

  const points = vtkPoints.newInstance();
  points.setData(Float32Array.from(positions));
  polyData.setPoints(points);

  const cells = vtkCellArray.newInstance();
  cells.setData(Uint32Array.from(cellData));
  polyData.setPolys(cells);

  return polyData;
}

/**
 * Create Three.js BufferGeometry from positions and indices
 * @param {Float32Array|Array} positions - Vertex positions [x,y,z, x,y,z, ...]
 * @param {Uint32Array|Array} indices - Triangle indices [i0,i1,i2, i3,i4,i5, ...]
 * @returns {THREE.BufferGeometry}
 */
export function createGeometryFromData(positions, indices) {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array(positions), 3
  ));

  if (indices) {
    geometry.setIndex(new THREE.BufferAttribute(
      new Uint32Array(indices), 1
    ));
  }

  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Convert vtk.js-style cellData to Three.js indices array
 * @param {Array} cellData - vtk.js format [3, i0, i1, i2, 3, i3, i4, i5, ...]
 * @returns {Uint32Array} - Three.js indices
 */
export function cellDataToIndices(cellData) {
  const indices = [];
  let offset = 0;

  while (offset < cellData.length) {
    const numPts = cellData[offset++];
    for (let i = 0; i < numPts; i++) {
      indices.push(cellData[offset++]);
    }
  }

  return new Uint32Array(indices);
}

/**
 * Convert Three.js indices to vtk.js-style cellData
 * @param {Array|Uint32Array} indices - Three.js indices
 * @returns {Array} - vtk.js format [3, i0, i1, i2, 3, i3, i4, i5, ...]
 */
export function indicesToCellData(indices) {
  const cellData = [];

  for (let i = 0; i < indices.length; i += 3) {
    cellData.push(3, indices[i], indices[i + 1], indices[i + 2]);
  }

  return cellData;
}

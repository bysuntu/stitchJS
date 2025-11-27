// Main entry point - imports VTK.js locally
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkGlyph3DMapper from '@kitware/vtk.js/Rendering/Core/Glyph3DMapper';

// Import our custom operations
import {
  detectBoundaryEdgesSTLWithAdjacency,
  detectSharpCornersWithMap,
  traceBoundaryPolylinesOptimized,
  analyzePolylines
} from './ops.js';

// Import point merging utilities
import { removeDuplicatePoints } from './mergePoints.js';

// Global state
let state = {
  polyData: null,
  boundaryData: null,
  corners: null,
  polylines: null,
  actors: {
    mesh: null,
    boundary: null,
    corners: null,
    polylines: null
  }
};

// Setup VTK renderer
const viewerElement = document.getElementById('viewer');
const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  rootContainer: viewerElement,
  background: [0.1, 0.1, 0.1],
  containerStyle: {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%'
  }
});

const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();
const interactor = fullScreenRenderer.getInteractor();

// Add some lighting
renderer.setTwoSidedLighting(true);

// Make sure rendering starts
renderWindow.render();

console.log('VTK.js initialized successfully (local npm package)');

// UI elements
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const processBtn = document.getElementById('processBtn');
const angleThreshold = document.getElementById('angleThreshold');
const angleValue = document.getElementById('angleValue');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');

// Visibility checkboxes
const showMesh = document.getElementById('showMesh');
const showBoundary = document.getElementById('showBoundary');
const showCorners = document.getElementById('showCorners');
const showPolylines = document.getElementById('showPolylines');

// Color inputs
const meshColor = document.getElementById('meshColor');
const boundaryColor = document.getElementById('boundaryColor');
const cornerColor = document.getElementById('cornerColor');
const polylineColor = document.getElementById('polylineColor');

// Stats
const statVertices = document.getElementById('statVertices');
const statTriangles = document.getElementById('statTriangles');
const statBoundaryEdges = document.getElementById('statBoundaryEdges');
const statCorners = document.getElementById('statCorners');
const statPolylines = document.getElementById('statPolylines');
const polylineList = document.getElementById('polylineList');

// Event listeners
fileInput.addEventListener('change', handleFileSelect);
processBtn.addEventListener('click', processSTL);
angleThreshold.addEventListener('input', (e) => {
  angleValue.textContent = e.target.value;
});

showMesh.addEventListener('change', () => updateVisibility());
showBoundary.addEventListener('change', () => updateVisibility());
showCorners.addEventListener('change', () => updateVisibility());
showPolylines.addEventListener('change', () => updateVisibility());

meshColor.addEventListener('change', () => updateColors());
boundaryColor.addEventListener('change', () => updateColors());
cornerColor.addEventListener('change', () => updateColors());
polylineColor.addEventListener('change', () => updateColors());

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 5000);
}

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  fileName.textContent = file.name;
  loading.style.display = 'block';

  try {
    // Load STL file
    const reader = vtkSTLReader.newInstance();
    const arrayBuffer = await file.arrayBuffer();
    reader.parseAsArrayBuffer(arrayBuffer);
    const rawPolyData = reader.getOutputData();

    console.log('Loaded STL:', rawPolyData.getNumberOfPoints(), 'points');

    // Step 1: Merge exact duplicates first (required for proper STL conversion)
    const cleanPolyData = removeDuplicatePoints(rawPolyData, 0);
    console.log('After exact duplicate removal:', cleanPolyData.getNumberOfPoints(), 'points');

    // Step 2: Apply proximity-based merging for close points
    const proximityTolerance = 1e-6; // Adjust: 1e-6 = very close, 1e-3 = looser
    state.polyData = removeDuplicatePoints(cleanPolyData, proximityTolerance);
    console.log('After proximity merging:', state.polyData.getNumberOfPoints(), 'points');

    // Update stats
    const numPoints = state.polyData.getNumberOfPoints();
    const numCells = state.polyData.getNumberOfPolys();
    statVertices.textContent = numPoints.toLocaleString();
    statTriangles.textContent = numCells.toLocaleString();

    // Visualize mesh
    visualizeMesh(state.polyData);

    processBtn.disabled = false;
    loading.style.display = 'none';
  } catch (error) {
    console.error('Error loading STL:', error);
    showError('Failed to load STL file: ' + error.message);
    loading.style.display = 'none';
  }
}

function visualizeMesh(polyData) {
  // Remove old mesh actor
  if (state.actors.mesh) {
    renderer.removeActor(state.actors.mesh);
  }

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  const color = hexToRgb(meshColor.value);
  actor.getProperty().setColor(color[0], color[1], color[2]);
  actor.getProperty().setOpacity(0.7);

  renderer.addActor(actor);
  state.actors.mesh = actor;

  renderer.resetCamera();
  renderWindow.render();
}

async function processSTL() {
  if (!state.polyData) return;

  loading.style.display = 'block';
  processBtn.disabled = true;

  // Use setTimeout to allow UI to update
  setTimeout(() => {
    try {
      const angleThresholdValue = parseInt(angleThreshold.value);

      console.log('Step 1: Detecting boundaries...');
      state.boundaryData = detectBoundaryEdgesSTLWithAdjacency(state.polyData);
      console.log(`  Found ${state.boundaryData.boundaryEdges.length} boundary edges`);

      console.log('Step 2: Detecting corners...');
      state.corners = detectSharpCornersWithMap(state.polyData, state.boundaryData, angleThresholdValue);
      console.log(`  Found ${state.corners.length} corners`);

      console.log('Step 3: Tracing polylines...');
      state.polylines = traceBoundaryPolylinesOptimized(state.polyData, state.boundaryData, state.corners);
      console.log(`  Created ${state.polylines.length} polylines`);

      // Analyze and sort
      state.polylines = analyzePolylines(state.polylines);

      // Update stats
      statBoundaryEdges.textContent = state.boundaryData.boundaryEdges.length.toLocaleString();
      statCorners.textContent = state.corners.length.toLocaleString();
      statPolylines.textContent = state.polylines.length.toLocaleString();

      // Update polyline list
      updatePolylineList();

      // Visualize results
      visualizeBoundaryEdges(state.boundaryData);
      visualizeCorners(state.corners);
      visualizePolylines(state.polylines);

      loading.style.display = 'none';
      processBtn.disabled = false;
    } catch (error) {
      console.error('Error processing STL:', error);
      showError('Failed to process STL: ' + error.message);
      loading.style.display = 'none';
      processBtn.disabled = false;
    }
  }, 50);
}

function visualizeBoundaryEdges(boundaryData) {
  // Remove old boundary actor
  if (state.actors.boundary) {
    renderer.removeActor(state.actors.boundary);
  }

  const points = state.polyData.getPoints();
  const pointData = points.getData();

  // Create lines
  const linesPolyData = vtkPolyData.newInstance();
  const linesPoints = vtkPoints.newInstance();
  const lines = vtkCellArray.newInstance();

  const pointsArray = [];
  const linesArray = [];

  boundaryData.boundaryEdges.forEach(([pt1, pt2]) => {
    const idx1 = pointsArray.length / 3;
    pointsArray.push(
      pointData[pt1 * 3],
      pointData[pt1 * 3 + 1],
      pointData[pt1 * 3 + 2]
    );

    const idx2 = pointsArray.length / 3;
    pointsArray.push(
      pointData[pt2 * 3],
      pointData[pt2 * 3 + 1],
      pointData[pt2 * 3 + 2]
    );

    linesArray.push(2, idx1, idx2);
  });

  linesPoints.setData(Float32Array.from(pointsArray));
  lines.setData(Uint32Array.from(linesArray));

  linesPolyData.setPoints(linesPoints);
  linesPolyData.setLines(lines);

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(linesPolyData);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  const color = hexToRgb(boundaryColor.value);
  actor.getProperty().setColor(color[0], color[1], color[2]);
  actor.getProperty().setLineWidth(3);

  renderer.addActor(actor);
  state.actors.boundary = actor;

  renderWindow.render();
}

function visualizeCorners(corners) {
  // Remove old corners actors
  if (state.actors.corners) {
    if (Array.isArray(state.actors.corners)) {
      state.actors.corners.forEach(actor => renderer.removeActor(actor));
    } else {
      renderer.removeActor(state.actors.corners);
    }
  }

  if (corners.length === 0) return;

  // Calculate a dynamic radius for the spheres based on the model's bounding box
  const bounds = state.polyData.getBounds();
  const diagonal = Math.sqrt(
    (bounds[1] - bounds[0]) ** 2 +
    (bounds[3] - bounds[2]) ** 2 +
    (bounds[5] - bounds[4]) ** 2
  );
  const radius = diagonal * 0.01; // Use 1% of the bounding box diagonal as radius

  const color = hexToRgb(cornerColor.value);
  const cornerActors = [];

  // Create a separate sphere for each corner
  corners.forEach((corner) => {
    const sphereSource = vtkSphereSource.newInstance({
      center: corner.position,
      radius: radius,
      thetaResolution: 16,
      phiResolution: 16
    });

    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(sphereSource.getOutputPort());

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(color[0], color[1], color[2]);

    renderer.addActor(actor);
    cornerActors.push(actor);
  });

  state.actors.corners = cornerActors;

  renderWindow.render();
}

function visualizePolylines(polylines) {
  // Remove old polylines actor
  if (state.actors.polylines) {
    renderer.removeActor(state.actors.polylines);
  }

  if (polylines.length === 0) return;

  // Create polylines
  const polylinesPolyData = vtkPolyData.newInstance();
  const polylinesPoints = vtkPoints.newInstance();
  const lines = vtkCellArray.newInstance();

  const pointsArray = [];
  const linesArray = [];
  let pointOffset = 0;

  polylines.forEach(polyline => {
    const numPoints = polyline.positions.length;

    // Add points
    polyline.positions.forEach(pos => {
      pointsArray.push(...pos);
    });

    // Add line connectivity
    linesArray.push(numPoints);
    for (let i = 0; i < numPoints; i++) {
      linesArray.push(pointOffset + i);
    }

    pointOffset += numPoints;
  });

  polylinesPoints.setData(Float32Array.from(pointsArray));
  lines.setData(Uint32Array.from(linesArray));

  polylinesPolyData.setPoints(polylinesPoints);
  polylinesPolyData.setLines(lines);

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polylinesPolyData);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  const color = hexToRgb(polylineColor.value);
  actor.getProperty().setColor(color[0], color[1], color[2]);
  actor.getProperty().setLineWidth(4);

  renderer.addActor(actor);
  state.actors.polylines = actor;

  renderWindow.render();
}

function updatePolylineList() {
  if (!state.polylines || state.polylines.length === 0) {
    polylineList.innerHTML = 'No polylines detected';
    return;
  }

  polylineList.innerHTML = '';

  state.polylines.forEach((polyline, idx) => {
    const item = document.createElement('div');
    item.className = 'polyline-item';
    item.innerHTML = `
      <strong>Polyline ${idx + 1}</strong><br>
      Points: ${polyline.numPoints} | Length: ${polyline.euclideanLength.toFixed(2)}
    `;
    polylineList.appendChild(item);
  });
}

function updateVisibility() {
  if (state.actors.mesh) {
    state.actors.mesh.setVisibility(showMesh.checked);
  }
  if (state.actors.boundary) {
    state.actors.boundary.setVisibility(showBoundary.checked);
  }
  if (state.actors.corners) {
    if (Array.isArray(state.actors.corners)) {
      state.actors.corners.forEach(actor => actor.setVisibility(showCorners.checked));
    } else {
      state.actors.corners.setVisibility(showCorners.checked);
    }
  }
  if (state.actors.polylines) {
    state.actors.polylines.setVisibility(showPolylines.checked);
  }
  renderWindow.render();
}

function updateColors() {
  if (state.actors.mesh) {
    const color = hexToRgb(meshColor.value);
    state.actors.mesh.getProperty().setColor(color[0], color[1], color[2]);
  }
  if (state.actors.boundary) {
    const color = hexToRgb(boundaryColor.value);
    state.actors.boundary.getProperty().setColor(color[0], color[1], color[2]);
  }
  if (state.actors.corners) {
    const color = hexToRgb(cornerColor.value);
    if (Array.isArray(state.actors.corners)) {
      state.actors.corners.forEach(actor => {
        actor.getProperty().setColor(color[0], color[1], color[2]);
      });
    } else {
      state.actors.corners.getProperty().setColor(color[0], color[1], color[2]);
    }
  }
  if (state.actors.polylines) {
    const color = hexToRgb(polylineColor.value);
    state.actors.polylines.getProperty().setColor(color[0], color[1], color[2]);
  }
  renderWindow.render();
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ] : [0.5, 0.5, 0.5];
}

// Initialize
console.log('STL Boundary & Polyline Viewer initialized with local VTK.js');
console.log('Load an STL file to get started');

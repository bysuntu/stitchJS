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
  detechBoundaryPolylines,
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
    polylines: null,
    wireframe: null,
    highlightedCells: [] // Array of highlighted cell actors for each polyline
  },
  playback: {
    currentIndex: -1,
    isPlaying: false,
    intervalId: null,
    speed: 1000 // milliseconds per polyline
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
const showWireframe = document.getElementById('showWireframe');

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
const currentPolyline = document.getElementById('currentPolyline');
const firstBtn = document.getElementById('firstBtn');
const prevBtn = document.getElementById('prevBtn');
const playBtn = document.getElementById('playBtn');
const nextBtn = document.getElementById('nextBtn');
const lastBtn = document.getElementById('lastBtn');
const cellOpacity = document.getElementById('cellOpacity');
const opacityValue = document.getElementById('opacityValue');

// Event listeners
fileInput.addEventListener('change', handleFileSelect);
processBtn.addEventListener('click', processSTL);
angleThreshold.addEventListener('input', (e) => {
  angleValue.textContent = e.target.value;
});

cellOpacity.addEventListener('input', (e) => {
  opacityValue.textContent = e.target.value;
  updateCellOpacity(e.target.value / 100);
});

showMesh.addEventListener('change', () => updateVisibility());
showBoundary.addEventListener('change', () => updateVisibility());
showCorners.addEventListener('change', () => updateVisibility());
showPolylines.addEventListener('change', () => updateVisibility());
if (showWireframe) {
  showWireframe.addEventListener('change', () => updateVisibility());
}

meshColor.addEventListener('change', () => updateColors());
boundaryColor.addEventListener('change', () => updateColors());
cornerColor.addEventListener('change', () => updateColors());
polylineColor.addEventListener('change', () => updateColors());

// Playback controls
firstBtn.addEventListener('click', () => {
  console.log('First button clicked');
  showPolyline(0);
});
prevBtn.addEventListener('click', () => {
  console.log('Prev button clicked');
  showPolyline(state.playback.currentIndex - 1);
});
playBtn.addEventListener('click', () => {
  console.log('Play button clicked, isPlaying:', state.playback.isPlaying);
  togglePlayback();
});
nextBtn.addEventListener('click', () => {
  console.log('Next button clicked');
  showPolyline(state.playback.currentIndex + 1);
});
lastBtn.addEventListener('click', () => {
  console.log('Last button clicked');
  showPolyline(state.polylines ? state.polylines.length - 1 : 0);
});

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

    console.log('Loaded STL:', rawPolyData.getNumberOfPoints(), 'points', rawPolyData.getNumberOfPolys(), 'cells');

    // DEBUG: Commenting out merging and degenerate removal to debug holes
    /*
    // Step 1: Merge exact duplicates first (required for proper STL conversion)
    const cleanPolyData = removeDuplicatePoints(rawPolyData, 0);
    console.log('After exact duplicate removal:', cleanPolyData.getNumberOfPoints(), 'points');

    // Step 2: Apply proximity-based merging for close points
    const proximityTolerance = 1e-5; // Adjust: 1e-6 = very close, 1e-5 = slightly looser, 1e-3 = very loose
    const mergedPolyData = removeDuplicatePoints(cleanPolyData, proximityTolerance);
    console.log('After proximity merging (tolerance:', proximityTolerance + '):', mergedPolyData.getNumberOfPoints(), 'points');

    // Step 3: Remove degenerate triangles (triangles with duplicate vertices created by merging)
    state.polyData = removeDegenerateCells(mergedPolyData);
    console.log('After removing degenerate cells:', state.polyData.getNumberOfPoints(), 'points', state.polyData.getNumberOfPolys(), 'cells');
    */

    // DEBUG: Use raw polydata directly
    state.polyData = rawPolyData;
    console.log('Using raw polydata without merging or degenerate removal');

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
  actor.getProperty().setOpacity(1.0); // Fully opaque by default

  renderer.addActor(actor);
  state.actors.mesh = actor;

  // Also create wireframe when mesh is loaded
  visualizeWireframe(polyData);

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
      state.polylines = detechBoundaryPolylines(state.polyData, state.boundaryData, state.corners);
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
  // Remove old polylines actors
  if (state.actors.polylines) {
    if (Array.isArray(state.actors.polylines)) {
      state.actors.polylines.forEach(actor => renderer.removeActor(actor));
    } else {
      renderer.removeActor(state.actors.polylines);
    }
  }

  if (polylines.length === 0) return;

  // Create separate actor for each polyline
  const actors = [];
  const color = hexToRgb(polylineColor.value);

  polylines.forEach(polyline => {
    const polyData = vtkPolyData.newInstance();
    const points = vtkPoints.newInstance();
    const lines = vtkCellArray.newInstance();

    const pointsArray = [];
    const linesArray = [];

    const numPoints = polyline.positions.length;

    // Add points
    polyline.positions.forEach(pos => {
      pointsArray.push(...pos);
    });

    // Add line connectivity
    linesArray.push(numPoints);
    for (let i = 0; i < numPoints; i++) {
      linesArray.push(i);
    }

    points.setData(Float32Array.from(pointsArray));
    lines.setData(Uint32Array.from(linesArray));

    polyData.setPoints(points);
    polyData.setLines(lines);

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(color[0], color[1], color[2]);
    actor.getProperty().setLineWidth(4);

    renderer.addActor(actor);
    actors.push(actor);
  });

  state.actors.polylines = actors;

  // Create highlighted cell actors for each polyline
  createHighlightedCells(polylines);

  renderWindow.render();
}

function createHighlightedCells(polylines) {
  // Remove old highlighted cell actors
  if (state.actors.highlightedCells && state.actors.highlightedCells.length > 0) {
    state.actors.highlightedCells.forEach(actor => {
      if (actor) renderer.removeActor(actor);
    });
  }

  state.actors.highlightedCells = [];

  if (!state.polyData || polylines.length === 0) return;

  const points = state.polyData.getPoints();
  const pointData = points.getData();
  const cells = state.polyData.getPolys();
  const cellData = cells.getData();

  // Create a highlighted actor for each polyline
  polylines.forEach((polyline, idx) => {
    if (!polyline.cellIds || polyline.cellIds.length === 0) {
      state.actors.highlightedCells.push(null);
      return;
    }

    // Create polydata with only the cells from this polyline
    const highlightPolyData = vtkPolyData.newInstance();
    const highlightPoints = vtkPoints.newInstance();
    const highlightCells = vtkCellArray.newInstance();

    // Reuse the same points
    highlightPoints.setData(pointData);

    // Extract only the cells for this polyline
    const newCellData = [];
    let offset = 0;

    for (let cellId = 0; cellId < state.polyData.getNumberOfPolys(); cellId++) {
      const numPts = cellData[offset];

      if (polyline.cellIds.includes(cellId)) {
        // Include this cell
        newCellData.push(numPts);
        for (let i = 0; i < numPts; i++) {
          newCellData.push(cellData[offset + 1 + i]);
        }
      }

      offset += numPts + 1;
    }

    highlightCells.setData(Uint32Array.from(newCellData));
    highlightPolyData.setPoints(highlightPoints);
    highlightPolyData.setPolys(highlightCells);

    // Create mapper and actor
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(highlightPolyData);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(0.0, 0.5, 1.0); // Blue
    actor.getProperty().setOpacity(0.7);
    actor.setVisibility(false); // Hidden by default

    renderer.addActor(actor);
    state.actors.highlightedCells.push(actor);
  });
}

function visualizeWireframe(polyData) {
  // Remove old wireframe actor
  if (state.actors.wireframe) {
    renderer.removeActor(state.actors.wireframe);
    state.actors.wireframe = null;
  }

  if (!polyData) return;

  // Create wireframe from all edges of the mesh
  const polys = polyData.getPolys();
  const points = polyData.getPoints();
  const cellData = polys.getData();

  const edgeSet = new Set();
  const edgesArray = [];

  // Extract all edges from triangles
  let offset = 0;
  const numCells = polyData.getNumberOfPolys();

  for (let cellId = 0; cellId < numCells; cellId++) {
    const cellSize = cellData[offset++];
    const cellPoints = [];

    for (let i = 0; i < cellSize; i++) {
      cellPoints.push(cellData[offset++]);
    }

    // Create edges for this cell (triangle)
    for (let i = 0; i < cellSize; i++) {
      const p1 = cellPoints[i];
      const p2 = cellPoints[(i + 1) % cellSize];

      // Create unique edge key
      const edgeKey = p1 < p2 ? `${p1},${p2}` : `${p2},${p1}`;

      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edgesArray.push(p1, p2);
      }
    }
  }

  // Create polydata for wireframe
  const wireframePolyData = vtkPolyData.newInstance();
  wireframePolyData.setPoints(points);

  // Create lines for wireframe
  const lines = vtkCellArray.newInstance();
  const linesData = [];

  for (let i = 0; i < edgesArray.length; i += 2) {
    linesData.push(2, edgesArray[i], edgesArray[i + 1]);
  }

  lines.setData(Uint32Array.from(linesData));
  wireframePolyData.setLines(lines);

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(wireframePolyData);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  // Yellow color
  actor.getProperty().setColor(1.0, 1.0, 0.0);
  actor.getProperty().setLineWidth(1);

  renderer.addActor(actor);
  state.actors.wireframe = actor;

  renderWindow.render();
}

function updatePolylineList() {
  if (!state.polylines || state.polylines.length === 0) {
    disablePlaybackControls();
    return;
  }

  enablePlaybackControls();
  if (state.polylines.length > 0) {
    showPolyline(0); // Show first polyline by default
  }
}

function showPolyline(index) {
  if (!state.polylines || state.polylines.length === 0) return;

  // Clamp index to valid range
  index = Math.max(0, Math.min(index, state.polylines.length - 1));
  state.playback.currentIndex = index;

  // Hide all polylines and highlighted cells
  if (state.actors.polylines && Array.isArray(state.actors.polylines)) {
    state.actors.polylines.forEach(actor => actor.setVisibility(false));
  }
  if (state.actors.highlightedCells && Array.isArray(state.actors.highlightedCells)) {
    state.actors.highlightedCells.forEach(actor => {
      if (actor) actor.setVisibility(false);
    });
  }

  // Show only the selected polyline
  if (state.actors.polylines && state.actors.polylines[index]) {
    state.actors.polylines[index].setVisibility(showPolylines.checked);
  }

  // Show highlighted cells for the selected polyline
  if (state.actors.highlightedCells && state.actors.highlightedCells[index]) {
    state.actors.highlightedCells[index].setVisibility(true);
  }

  // Update UI with polyline details
  const polyline = state.polylines[index];
  const lengthStr = polyline.euclideanLength < 1
    ? polyline.euclideanLength.toFixed(4)
    : polyline.euclideanLength.toFixed(2);
  currentPolyline.textContent = `Polyline ${index + 1}/${state.polylines.length} • ${polyline.pointCount} pts • Len: ${lengthStr} • ${polyline.cellIds ? polyline.cellIds.length : 0} cells`;

  // Log detailed information
  console.log(`\n=== Polyline ${index + 1}/${state.polylines.length} ===`);
  console.log(`Points: ${polyline.pointCount}, Length: ${polyline.euclideanLength}`);
  console.log(`Point IDs: [${polyline.pointIds ? polyline.pointIds.join(', ') : 'N/A'}]`);

  // Show point coordinates
  if (polyline.positions && polyline.positions.length > 0) {
    console.log(`Point Coordinates:`);
    polyline.positions.forEach((pos, idx) => {
      const pointId = polyline.pointIds ? polyline.pointIds[idx] : idx;
      console.log(`  Point ${pointId}: (${pos[0].toFixed(6)}, ${pos[1].toFixed(6)}, ${pos[2].toFixed(6)})`);
    });
  }

  console.log(`Cell IDs: [${polyline.cellIds ? polyline.cellIds.join(', ') : 'N/A'}]`);

  // Update button states
  updatePlaybackButtons();
  renderWindow.render();
}

function togglePlayback() {
  console.log('togglePlayback called, isPlaying:', state.playback.isPlaying);
  console.log('Number of polylines:', state.polylines ? state.polylines.length : 'null');
  console.log('Current index:', state.playback.currentIndex);

  if (state.playback.isPlaying) {
    console.log('Stopping playback');
    stopPlayback();
  } else {
    console.log('Starting playback');
    startPlayback();
  }
}

function startPlayback() {
  if (!state.polylines || state.polylines.length === 0) {
    console.log('Cannot start playback: no polylines');
    return;
  }

  console.log('Starting playback from index:', state.playback.currentIndex);
  state.playback.isPlaying = true;
  playBtn.textContent = '⏸';
  playBtn.classList.add('playing');

  state.playback.intervalId = setInterval(() => {
    let nextIndex = state.playback.currentIndex + 1;
    if (nextIndex >= state.polylines.length) {
      nextIndex = 0; // Loop back to start
    }
    console.log('Advancing to polyline:', nextIndex);
    showPolyline(nextIndex);
  }, state.playback.speed);
}

function stopPlayback() {
  state.playback.isPlaying = false;
  playBtn.textContent = '▶';
  playBtn.classList.remove('playing');

  if (state.playback.intervalId) {
    clearInterval(state.playback.intervalId);
    state.playback.intervalId = null;
  }
}

function updatePlaybackButtons() {
  const hasPolylines = state.polylines && state.polylines.length > 0;
  const currentIdx = state.playback.currentIndex;
  const maxIdx = hasPolylines ? state.polylines.length - 1 : 0;

  firstBtn.disabled = !hasPolylines || currentIdx === 0;
  prevBtn.disabled = !hasPolylines || currentIdx === 0;
  nextBtn.disabled = !hasPolylines || currentIdx === maxIdx;
  lastBtn.disabled = !hasPolylines || currentIdx === maxIdx;
}

function enablePlaybackControls() {
  playBtn.disabled = false;
  updatePlaybackButtons();
}

function disablePlaybackControls() {
  stopPlayback();
  firstBtn.disabled = true;
  prevBtn.disabled = true;
  playBtn.disabled = true;
  nextBtn.disabled = true;
  lastBtn.disabled = true;
  currentPolyline.textContent = 'No polyline selected';
}

function updateCellOpacity(opacity) {
  // Update main mesh opacity
  if (state.actors.mesh) {
    state.actors.mesh.getProperty().setOpacity(opacity);
  }

  // Update highlighted cells opacity
  if (state.actors.highlightedCells && Array.isArray(state.actors.highlightedCells)) {
    state.actors.highlightedCells.forEach(actor => {
      if (actor) {
        actor.getProperty().setOpacity(opacity);
      }
    });
  }

  renderWindow.render();
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
    if (Array.isArray(state.actors.polylines)) {
      // In playback mode, visibility is controlled by showPolyline()
      // Only update if checkbox is toggled and we're not in single-view mode
      if (state.playback.currentIndex === -1) {
        state.actors.polylines.forEach(actor => actor.setVisibility(showPolylines.checked));
      } else {
        // Update current polyline visibility based on checkbox
        showPolyline(state.playback.currentIndex);
      }
    } else {
      state.actors.polylines.setVisibility(showPolylines.checked);
    }
  }
  if (state.actors.wireframe && showWireframe) {
    state.actors.wireframe.setVisibility(showWireframe.checked);
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
    if (Array.isArray(state.actors.polylines)) {
      state.actors.polylines.forEach(actor => {
        actor.getProperty().setColor(color[0], color[1], color[2]);
      });
    } else {
      state.actors.polylines.getProperty().setColor(color[0], color[1], color[2]);
    }
  }
  renderWindow.render();
}

function removeDegenerateCells(polyData) {
  const cells = polyData.getPolys();
  const cellData = cells.getData();
  const numCells = polyData.getNumberOfPolys();
  const points = polyData.getPoints();
  const pointData = points.getData();

  const validCells = [];
  let offset = 0;
  let duplicateCount = 0;
  let collinearCount = 0;

  for (let cellId = 0; cellId < numCells; cellId++) {
    const numPts = cellData[offset];
    const pts = [];
    for (let i = 0; i < numPts; i++) {
      pts.push(cellData[offset + 1 + i]);
    }

    // Check if triangle has duplicate vertices
    const hasDuplicates = pts[0] === pts[1] || pts[1] === pts[2] || pts[0] === pts[2];

    // Check for collinear vertices (zero area)
    let isCollinear = false;
    if (!hasDuplicates && numPts === 3) {
      // Get vertices
      const v0 = [pointData[pts[0]*3], pointData[pts[0]*3+1], pointData[pts[0]*3+2]];
      const v1 = [pointData[pts[1]*3], pointData[pts[1]*3+1], pointData[pts[1]*3+2]];
      const v2 = [pointData[pts[2]*3], pointData[pts[2]*3+1], pointData[pts[2]*3+2]];

      // Calculate cross product to determine area
      const edge1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
      const edge2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
      const cross = [
        edge1[1]*edge2[2] - edge1[2]*edge2[1],
        edge1[2]*edge2[0] - edge1[0]*edge2[2],
        edge1[0]*edge2[1] - edge1[1]*edge2[0]
      ];
      const crossMag = Math.sqrt(cross[0]*cross[0] + cross[1]*cross[1] + cross[2]*cross[2]);

      // Check if area is essentially zero (collinear vertices)
      // Use 1e-6 threshold to account for floating-point precision and nearly-degenerate triangles
      if (crossMag < 1e-6) {
        isCollinear = true;
        collinearCount++;
        console.log(`  Removing cell ${cellId} with collinear vertices [${pts.join(', ')}], crossMag = ${crossMag}, area = ${(crossMag/2).toFixed(10)}`);
      }
    }

    if (!hasDuplicates && !isCollinear) {
      // Valid triangle - keep it
      validCells.push(numPts, ...pts);
    } else if (hasDuplicates) {
      duplicateCount++;
    }

    offset += numPts + 1;
  }

  if (duplicateCount > 0) {
    console.warn(`Removed ${duplicateCount} degenerate triangles (duplicate vertices)`);
  }
  if (collinearCount > 0) {
    console.warn(`Removed ${collinearCount} degenerate triangles (collinear vertices, zero area)`);
  }

  // Create new polydata with valid cells only
  const newPolyData = vtkPolyData.newInstance();
  const newCells = vtkCellArray.newInstance();

  newCells.setData(Uint32Array.from(validCells));
  newPolyData.setPoints(polyData.getPoints());
  newPolyData.setPolys(newCells);

  return newPolyData;
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

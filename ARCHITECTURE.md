# STL Boundary Viewer - Architecture

This is a **React Three Fiber** application for visualizing STL files with boundary detection and polyline tracing.

## Technology Stack

- **React** - UI framework
- **React Three Fiber** - React renderer for Three.js
- **Three.js** - 3D rendering engine
- **@react-three/drei** - Three.js helpers
- **VTK.js** - Only used for geometry processing algorithms (boundary detection, point merging)
- **Vite** - Build tool and dev server

## Application Structure

### Entry Point
- `index.html` - Minimal HTML that mounts the React app at `#root`
- `src/main.jsx` - React app initialization

### Core Components
- `src/App.jsx` - Main application component with state management
- `src/components/Sidebar.jsx` - UI controls and settings
- `src/components/STLViewer.jsx` - 3D visualization using React Three Fiber

### Utility Modules
- `src/geometryAdapter.js` - Converts between Three.js and VTK.js data formats
- `src/ops.js` - Boundary detection, corner detection, and polyline tracing algorithms
- `src/mergePoints.js` - Point merging utilities (VTK-based)
- `src/mergePointsThree.js` - Point merging for Three.js geometries
- `src/renderConfig.js` - Rendering configuration (render order, polygon offset, tolerances)

## How It Works

1. **STL Loading**: Uses Three.js `STLLoader` to load STL files
2. **Geometry Processing**: Converts Three.js geometry to VTK polyData format for processing
3. **Boundary Detection**: Uses VTK.js-based algorithms to detect boundaries, corners, and trace polylines
4. **Visualization**: Renders everything using React Three Fiber components (`<mesh>`, `<line>`, `<lineSegments>`)

## Key Features

- Load and visualize STL files
- Merge duplicate/close points
- Detect boundary edges
- Detect sharp corners
- Trace boundary polylines
- Playback controls to step through polylines
- Interactive 3D view with OrbitControls
- Customizable colors and visibility settings
- Mesh opacity control

## Development

```bash
npm run dev    # Start dev server
npm run build  # Build for production
npm run preview # Preview production build
```

The dev server runs on http://localhost:8080

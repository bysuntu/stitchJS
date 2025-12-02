# STL Boundary & Polyline Viewer

A browser-based 3D viewer for analyzing STL mesh files, detecting boundary edges, finding sharp corners, and tracing continuous polylines along boundaries.

Built with **React Three Fiber** for modern 3D visualization and VTK.js algorithms for geometry processing.

## Features

- **STL File Loading**: Load and visualize STL mesh files using Three.js STLLoader
- **Boundary Detection**: Automatically detect open boundary edges in the mesh
- **Corner Detection**: Find sharp corners along boundaries with configurable angle threshold
- **Polyline Tracing**: Trace continuous polylines between corners
- **Interactive Visualization**:
  - Toggle visibility of mesh, wireframe, boundaries, corners, and polylines
  - Customize colors for each element
  - Adjust mesh opacity
  - View detailed statistics
  - Step through individual polylines with playback controls
- **Real-time Processing**: All computation happens in the browser

## Technology Stack

- **React** + **React Three Fiber** - 3D rendering with declarative React components
- **Three.js** - 3D graphics engine
- **@react-three/drei** - Useful helpers for React Three Fiber
- **VTK.js** - Geometry processing algorithms (boundary detection, point merging)
- **Vite** - Fast build tool and dev server

## How It Works

### 1. Boundary Edge Detection
The algorithm identifies boundary edges by counting how many triangles share each edge:
- Edges shared by 2 triangles are internal (closed mesh)
- Edges shared by only 1 triangle are boundary edges (holes or open boundaries)

Uses a Cantor pairing hash function for efficient edge deduplication.

### 2. Corner Detection
Detects sharp corners on boundaries by:
- Finding boundary points with exactly 2 neighbors
- Calculating the angle between the two adjacent edges
- Marking points with angles below the threshold as corners

### 3. Polyline Tracing
Traces continuous polylines between corners by:
- Starting from each corner
- Following boundary edges until reaching another corner
- Avoiding duplicate traversal of edges
- Computing total euclidean length
- Tracking associated triangle facets

## Usage

### Quick Start

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Run Development Server
```bash
npm run dev
```

The app will start at `http://localhost:8080`

#### 3. Build for Production
```bash
npm run build
```

This creates optimized files in the `dist/` folder that you can deploy to any web server.

### Serving the Built Files

After running `npm run build`, you can serve the `dist/` folder:

```bash
# Using Vite preview
npm run preview

# Using Python 3
cd dist
python -m http.server 8000

# Using Node.js
npx http-server dist

# Using PHP
cd dist
php -S localhost:8000
```

Then navigate to the appropriate localhost URL in your browser.

### How to Use the App

1. Click "Choose STL File" and select your STL file
2. Wait for the file to load and the mesh to appear
3. Adjust settings:
   - **Proximity Tolerance**: Control point merging (default: 1e-5)
   - **Corner Angle Threshold**: Adjust corner detection sensitivity (default: 30°)
4. Click "Process STL" to detect boundaries and polylines
5. Use the playback controls to step through individual polylines
6. Toggle visibility and customize colors as needed

## Controls

### File Loading
- **Choose STL File**: Select an STL file from your computer
- **Process STL**: Run boundary detection and polyline tracing algorithms

### Detection Settings
- **Proximity Tolerance**: Distance threshold for merging close points
  - Lower values (1e-6): Only merge very close points
  - Higher values (1e-3): Merge points further apart
- **Corner Angle Threshold**: Angle sensitivity for corner detection (5° - 90°)
  - Lower values: Detect only sharp corners
  - Higher values: Detect more gradual corners

### Visibility Toggles
- **Show Mesh**: Display the original 3D mesh
- **Show Wireframe**: Display mesh edges
- **Show Boundary Edges**: Display detected boundary edges (red)
- **Show Corners**: Display detected corners as spheres (green)
- **Show Polylines**: Display traced polylines (cyan)

### Mesh Opacity
- Control transparency of the main mesh (0-100%)
- Useful for seeing internal boundaries

### Playback Controls
- **⏮ First**: Jump to first polyline
- **◀ Previous**: Go to previous polyline
- **▶ Play/Pause**: Auto-play through all polylines
- **▶ Next**: Go to next polyline
- **⏭ Last**: Jump to last polyline

When a polyline is selected, its associated triangle facets are highlighted in blue.

### Colors
Customize the color of each visual element using color pickers:
- Mesh Color
- Boundary Color
- Corner Color
- Polyline Color
- Wireframe Color

### Statistics
View real-time statistics:
- Number of vertices
- Number of triangles
- Number of boundary edges
- Number of corners
- Number of polylines

## File Structure

```
stitchJS/
├── src/
│   ├── main.jsx              # React app entry point
│   ├── App.jsx               # Main app component with state management
│   ├── App.css               # Application styles
│   ├── components/
│   │   ├── STLViewer.jsx     # 3D viewer using React Three Fiber
│   │   └── Sidebar.jsx       # UI controls and settings
│   ├── ops.js                # Boundary detection, corner finding, polyline tracing
│   ├── geometryAdapter.js    # Three.js ↔ VTK.js format conversion
│   ├── mergePoints.js        # Point merging utilities (VTK-based)
│   ├── mergePointsThree.js   # Three.js point merging
│   └── renderConfig.js       # Render order and polygon offset settings
├── index.html                # Minimal HTML entry point
├── package.json              # Dependencies and scripts
├── vite.config.js            # Vite configuration
├── ARCHITECTURE.md           # Detailed architecture documentation
└── README.md                 # This file
```

## Technical Details

### Dependencies
- **React** v18.3.1 - UI framework
- **React DOM** v18.3.1 - React renderer for web
- **@react-three/fiber** v8.18.0 - React renderer for Three.js
- **@react-three/drei** v9.122.0 - Useful Three.js helpers
- **Three.js** v0.160.1 - 3D graphics engine
- **@kitware/vtk.js** v29.5.0 - Geometry processing algorithms
- **Vite** v7.2.4 - Build tool and dev server

### Browser Requirements
- Modern browser with WebGL support
- JavaScript enabled
- Recommended: Chrome, Firefox, Edge, or Safari (latest versions)

### NPM Scripts
- `npm run dev` - Start development server at http://localhost:8080 (with hot reload)
- `npm run build` - Build optimized production bundle to `dist/` folder
- `npm run preview` - Preview production build locally

### Performance
- Optimized for meshes with up to 100K triangles
- All processing is done client-side (no server required)
- Uses efficient data structures (Map, Set) for adjacency lookups
- Point merging and degenerate triangle removal for clean geometry

## Algorithms

### Point Merging
1. **Exact Duplicate Removal**: Merge points at identical positions (tolerance = 0)
2. **Proximity Merging**: Merge points within proximity tolerance (default 1e-5)
3. **Degenerate Triangle Removal**: Remove triangles with duplicate vertices or near-zero area

### Edge Hashing
Uses Cantor pairing function for unique edge identification:
```javascript
hash(a, b) = b * b + a  (where a < b)
```

### Adjacency Map
Builds a `Map<pointId, Set<[neighborId, rotation, cellId, apex]>>` for O(1) neighbor lookups during corner detection and polyline tracing.

### Polyline Tracing
- Uses edge visit tracking to avoid duplicate traversal
- Traces from each corner in both directions
- Stops when hitting another corner or dead end
- Computes both point count and euclidean length
- Tracks associated triangle facets for visualization

## Use Cases

- **Mesh Repair**: Identify holes and open boundaries in 3D models
- **Quality Inspection**: Verify mesh closure and detect defects
- **Path Planning**: Extract boundary contours for toolpath generation
- **3D Printing**: Validate model integrity before printing
- **CAD Analysis**: Analyze boundary curves of complex geometry
- **Stitching Analysis**: Visualize and analyze boundaries for mesh stitching operations

## Troubleshooting

**File won't load:**
- Ensure the file is a valid STL (ASCII or binary format)
- Check browser console for error messages

**No boundaries detected:**
- The mesh may be completely closed (no holes)
- Try a different STL file with known boundaries

**Performance issues:**
- Large meshes (>100K triangles) may take longer to process
- Consider simplifying the mesh in external software first
- Adjust proximity tolerance to reduce point count

**Visualization looks wrong:**
- Try adjusting the angle threshold
- Toggle different visibility options
- Use the wireframe view to see mesh structure
- Adjust mesh opacity to see internal features

**Playback controls disabled:**
- Process the STL file first to detect polylines
- Ensure polylines were detected (check statistics)

## License

MIT License - This project is provided as-is for educational and commercial use.

## Credits

Built with:
- React Three Fiber for 3D visualization
- VTK.js for geometry processing algorithms
- Three.js for 3D rendering
- Modern JavaScript (ES6+) and React
- Custom algorithms for boundary detection and polyline tracing

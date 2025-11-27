# Quick Start Guide

## Setup (One Time Only)

1. **Install Node.js** if you haven't already:
   - Download from https://nodejs.org/
   - Install the LTS (Long Term Support) version

2. **Install Project Dependencies**:
   ```bash
   npm install
   ```
   This will download VTK.js and other required packages (~536 packages, takes 1-2 minutes)

## Running the Application

### Option 1: Windows Users (Easiest)
Simply double-click `start-dev.bat` - the app will automatically open in your browser!

### Option 2: Command Line
```bash
npm run dev
```
The browser will open automatically to http://localhost:8080

## Using the Application

1. **Load STL File**
   - Click "Choose STL File" button
   - Select your STL file (or use the included `test.stl`)
   - The mesh will appear in the 3D viewer

2. **Process Boundaries**
   - Adjust "Corner Angle Threshold" slider if needed (default: 30°)
   - Click "Process STL" button
   - Wait a moment for processing

3. **View Results**
   - Red lines = Boundary edges
   - Green spheres = Detected corners
   - Cyan lines = Traced polylines
   - Check the Statistics panel for counts
   - Browse polylines in the list

4. **Customize View**
   - Toggle visibility of mesh/boundaries/corners/polylines
   - Change colors using color pickers
   - Rotate view by dragging with mouse
   - Zoom with mouse wheel

## Building for Production

To create optimized files for deployment:

```bash
npm run build
```

Built files will be in the `dist/` folder. You can:
- Upload `dist/` to any web server
- Or serve locally: `cd dist && python -m http.server 8000`

## Troubleshooting

**Nothing shows in the viewer after loading STL:**
- Check browser console (F12) for errors
- Ensure you clicked "Process STL" button
- Try refreshing the page

**VTK.js errors:**
- Run `npm install` again to ensure all packages are installed
- Clear browser cache and refresh

**Port 8080 already in use:**
- Close other applications using port 8080
- Or edit `webpack.config.js` to change the port number

## What's Happening Under the Hood

The application:
1. Loads your STL file using VTK.js STLReader
2. Analyzes the mesh to find edges that belong to only one triangle (boundaries)
3. Detects sharp corners where boundary edges meet at angles < threshold
4. Traces continuous polylines between corners
5. Visualizes everything in 3D using VTK.js WebGL rendering

All processing happens in your browser - no data is sent to any server!

## Next Steps

- Experiment with different STL files
- Adjust the corner angle threshold to find optimal settings
- Export polyline data (feature coming soon)
- Check out the algorithms in `src/ops.js`

Enjoy exploring your STL boundaries! 🎉

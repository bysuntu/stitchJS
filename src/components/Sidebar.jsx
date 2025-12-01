import { useRef, useEffect } from 'react';
import { GEOMETRY_TOLERANCES } from '../renderConfig';
import { stitchEdge, downloadPolyDataAsASCII, savePolyDataToDirectory } from '../ops';
import { useState } from 'react';
import { threeToPolyData } from '../geometryAdapter';

function Sidebar({ settings, onSettingsChange, onFileSelect, onProcess, geometry, processedData, playback, onPlaybackChange, cleanedPolyData, onStitchComplete, showFolderPicker = true }) {
  const fileInputRef = useRef(null);
  const [directoryHandle, setDirectoryHandle] = useState(null);
  const [directoryName, setDirectoryName] = useState('');
  const [stitchDone, setStitchDone] = useState(false);
  const playIntervalRef = useRef(null);
  const playbackRef = useRef(playback);
  const processedDataRef = useRef(processedData);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDownloadVTK = ({ vtkFileName }) => {
    console.log('handleDownloadVTK called');
    console.log('cleanedPolyData:', cleanedPolyData);
    if (cleanedPolyData) {
      // If a directory handle has been chosen, save into it.
      if (directoryHandle && window.showDirectoryPicker) {
        (async () => {
          try {
            const filename = window.prompt('Enter filename for VTK export', vtkFileName);
            if (filename === null) {
              console.log('User cancelled filename prompt; aborting save to directory.');
              return;
            }
            await savePolyDataToDirectory(directoryHandle, cleanedPolyData, filename.trim() || vtkFileName);
            console.log('Saved VTK to chosen directory');
          } catch (err) {
            console.error('Error saving to directory:', err);
            // Fallback to save picker/download
            downloadPolyDataAsASCII(cleanedPolyData, vtkFileName);
          }
        })();
      } else {
        downloadPolyDataAsASCII(cleanedPolyData, vtkFileName);
      }
    }
  };

  const handleChooseFolder = async () => {
    if (!window.showDirectoryPicker) {
      alert('Directory picker is not supported in this browser. Use Chrome/Edge or use the normal Download button.');
      return;
    }

    try {
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      setDirectoryName(handle.name || 'Selected Folder');
      console.log('Directory chosen:', handle);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('User cancelled directory picker');
      } else {
        console.error('Directory pick failed', err);
      }
    }
  };

  const handleClearFolder = () => {
    setDirectoryHandle(null);
    setDirectoryName('');
  };

  const handlePlayToggle = () => {
    if (playback.isPlaying) {
      // Stop playing
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      onPlaybackChange({ isPlaying: false });
    } else {
      // Start playing
      onPlaybackChange({ isPlaying: true });
    }
  };

  const handleStitchSlit = () => {
    const data = processedDataRef.current;
    if (!data?.polyLineArray || !data?.geometry) {
      console.warn('No polyline data or geometry available for stitching');
      return;
    }

    console.log('Stitching slit...');
    // Convert Three.js geometry to VTK polyData format for stitching
    const polyData = threeToPolyData(data.geometry);
    try {
      const cleaned = stitchEdge(polyData, data.polyLineArray);
      // Notify parent about the cleaned polyData so it can be saved/stored
      if (onStitchComplete) onStitchComplete(cleaned);
      // Mark that stitch was performed so save button can be shown
      setStitchDone(true);
    } catch (err) {
      console.error('Error during stitchEdge:', err);
    }
  };

  const showPolyline = (index) => {
    const data = processedDataRef.current;
    if (!data?.polylines) return;
    const clampedIndex = Math.max(0, Math.min(index, data.polylines.length - 1));
    onPlaybackChange({ currentIndex: clampedIndex });

    // Log polyline details
    const polyline = data.polylines[clampedIndex];
    console.log(`\n=== Polyline ${clampedIndex + 1}/${data.polylines.length} ===`);
    console.log(`Points: ${polyline.pointCount}, Length: ${polyline.euclideanLength}`);
    console.log(`Point IDs: [${polyline.pointIds.join(', ')}]`);

    // Calculate and log area of each neighboring facet
    if (polyline.cellDetails && data.geometry) {
      const positions = data.geometry.attributes.position.array;
      console.log(`\nNeighboring Facets (${polyline.cellDetails.length} cells):`);

      polyline.cellDetails.forEach((cell, idx) => {
        const [i0, i1, i2] = cell.pointIds;

        // Get vertex positions
        const v0 = [positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]];
        const v1 = [positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]];
        const v2 = [positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]];

        // Calculate triangle area using cross product
        // Area = 0.5 * |AB × AC|
        const AB = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const AC = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

        const cross = [
          AB[1] * AC[2] - AB[2] * AC[1],
          AB[2] * AC[0] - AB[0] * AC[2],
          AB[0] * AC[1] - AB[1] * AC[0]
        ];

        const crossMagnitude = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
        const area = 0.5 * crossMagnitude;

        // Calculate edge lengths for diagnostics
        const edgeAB = Math.sqrt(AB[0] * AB[0] + AB[1] * AB[1] + AB[2] * AB[2]);
        const edgeAC = Math.sqrt(AC[0] * AC[0] + AC[1] * AC[1] + AC[2] * AC[2]);
        const BC = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
        const edgeBC = Math.sqrt(BC[0] * BC[0] + BC[1] * BC[1] + BC[2] * BC[2]);

        console.log(`  Cell ${idx + 1} (ID: ${cell.cellId}): Area = ${area.toExponential(6)}, Points = [${i0}, ${i1}, ${i2}]`);
        console.log(`    Edge lengths: AB=${edgeAB.toExponential(4)}, AC=${edgeAC.toExponential(4)}, BC=${edgeBC.toExponential(4)}`);

        // Check if degenerate
        if (area < GEOMETRY_TOLERANCES.MIN_TRIANGLE_AREA) {
          console.log(`    ⚠️ Warning: Degenerate triangle (area < ${GEOMETRY_TOLERANCES.MIN_TRIANGLE_AREA.toExponential(2)})`);
        }
      });

      // Calculate total area
      const totalArea = polyline.cellDetails.reduce((sum, cell) => {
        const [i0, i1, i2] = cell.pointIds;
        const v0 = [positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]];
        const v1 = [positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]];
        const v2 = [positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]];
        const AB = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const AC = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        const cross = [
          AB[1] * AC[2] - AB[2] * AC[1],
          AB[2] * AC[0] - AB[0] * AC[2],
          AB[0] * AC[1] - AB[1] * AC[0]
        ];
        const crossMagnitude = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
        return sum + (0.5 * crossMagnitude);
      }, 0);

      console.log(`  Total Area: ${totalArea.toExponential(6)}`);
    }
  };

  // Update refs when props change
  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    processedDataRef.current = processedData;
  }, [processedData]);

  // Reset stitchDone when processed data changes (new file/process)
  useEffect(() => {
    setStitchDone(false);
  }, [processedData]);

  // Handle playback
  useEffect(() => {
    if (playback.isPlaying && processedData?.polylines) {
      playIntervalRef.current = setInterval(() => {
        const currentIndex = playbackRef.current.currentIndex;
        const nextIndex = (currentIndex + 1) % processedData.polylines.length;
        showPolyline(nextIndex);
      }, playback.speed);
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [playback.isPlaying, playback.speed, processedData]);

  const currentPolyline = processedData?.polylines?.[playback.currentIndex];

  return (
    <div className="sidebar">
      <h1>STL Boundary Viewer</h1>

      {/* File Input */}
      <div className="section">
        <div className="section-title">Load File</div>
        <div className="file-input-wrapper">
          <input
            ref={fileInputRef}
            type="file"
            accept=".stl"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            className="file-input-label"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose STL File
          </button>
          {cleanedPolyData && (
            <button
              className="file-input-label"
              style={{ marginTop: '10px' }}
              onClick={() => {handleDownloadVTK({vtkFileName: 'clean.vtk'})}}
            >
              Download VTK File
            </button>
          )}
          {showFolderPicker && (
            <div style={{ marginTop: 8 }}>
              <button onClick={handleChooseFolder} style={{ marginRight: 8 }}>
                Choose Folder...
              </button>
              {directoryName ? (
                <>
                  <span style={{ marginLeft: 8 }}>{directoryName}</span>
                  <button onClick={handleClearFolder} style={{ marginLeft: 8 }}>Clear</button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Detection Settings */}
      <div className="section">
        <div className="section-title">Detection Settings</div>
        <div className="control-group">
          <label>
            Corner Angle Threshold: <span>{settings.angleThreshold}</span>°
          </label>
          <input
            type="range"
            min="5"
            max="90"
            step="5"
            value={settings.angleThreshold}
            onChange={(e) => onSettingsChange({ angleThreshold: parseInt(e.target.value) })}
          />
        </div>
        <button
          className="process-btn"
          onClick={onProcess}
          disabled={!geometry}
        >
          Process STL
        </button>
      </div>

      {/* Visibility */}
      <div className="section">
        <div className="section-title">Visibility</div>
        <div className="checkbox-group">
          <input
            type="checkbox"
            id="showMesh"
            checked={settings.showMesh}
            onChange={(e) => onSettingsChange({ showMesh: e.target.checked })}
          />
          <label htmlFor="showMesh">Show Mesh</label>
        </div>
        <div className="checkbox-group">
          <input
            type="checkbox"
            id="showWireframe"
            checked={settings.showWireframe}
            onChange={(e) => onSettingsChange({ showWireframe: e.target.checked })}
          />
          <label htmlFor="showWireframe">Show Wireframe</label>
        </div>
        <div className="checkbox-group">
          <input
            type="checkbox"
            id="showBoundary"
            checked={settings.showBoundary}
            onChange={(e) => onSettingsChange({ showBoundary: e.target.checked })}
          />
          <label htmlFor="showBoundary">Show Boundary Edges</label>
        </div>
        <div className="checkbox-group">
          <input
            type="checkbox"
            id="showCorners"
            checked={settings.showCorners}
            onChange={(e) => onSettingsChange({ showCorners: e.target.checked })}
          />
          <label htmlFor="showCorners">Show Corners</label>
        </div>
        <div className="checkbox-group">
          <input
            type="checkbox"
            id="showPolylines"
            checked={settings.showPolylines}
            onChange={(e) => onSettingsChange({ showPolylines: e.target.checked })}
          />
          <label htmlFor="showPolylines">Show Polylines</label>
        </div>
        <div className="checkbox-group">
          <input
            type="checkbox"
            id="flatShading"
            checked={settings.flatShading}
            onChange={(e) => onSettingsChange({ flatShading: e.target.checked })}
          />
          <label htmlFor="flatShading">Flat Shading</label>
        </div>
      </div>

      {/* Colors */}
      <div className="section">
        <div className="section-title">Colors</div>
        <div className="control-group">
          <label>Mesh Color</label>
          <input
            type="color"
            value={settings.meshColor}
            onChange={(e) => onSettingsChange({ meshColor: e.target.value })}
          />
        </div>
        <div className="control-group">
          <label>Boundary Color</label>
          <input
            type="color"
            value={settings.boundaryColor}
            onChange={(e) => onSettingsChange({ boundaryColor: e.target.value })}
          />
        </div>
      </div>

      {/* Statistics */}
      {processedData && (
        <div className="section">
          <div className="section-title">Statistics</div>
          <div className="stats">
            <div className="stats-row">
              <span className="stats-label">Vertices:</span>
              <span className="stats-value">{processedData.numVertices?.toLocaleString()}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Triangles:</span>
              <span className="stats-value">{processedData.numTriangles?.toLocaleString()}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Boundary Edges:</span>
              <span className="stats-value">{processedData.boundaryData?.boundaryEdges.length?.toLocaleString()}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Corners:</span>
              <span className="stats-value">{processedData.corners?.length?.toLocaleString()}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Polylines:</span>
              <span className="stats-value">{processedData.polylines?.length?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Polylines Playback */}
      {processedData?.polylines && (
        <div className="section">
          <div className="section-title">Polylines</div>
          <div className="playback-controls">
            <button
              className="control-btn"
              onClick={() => showPolyline(0)}
              disabled={!processedData.polylines}
            >
              ⏮
            </button>
            <button
              className="control-btn"
              onClick={() => showPolyline(playback.currentIndex - 1)}
              disabled={!processedData.polylines}
            >
              ◀
            </button>
            <button
              className={`control-btn ${playback.isPlaying ? 'playing' : ''}`}
              onClick={handlePlayToggle}
              disabled={!processedData.polylines}
            >
              {playback.isPlaying ? '⏸' : '▶'}
            </button>
            <button
              className="control-btn"
              onClick={() => showPolyline(playback.currentIndex + 1)}
              disabled={!processedData.polylines}
            >
              ▶
            </button>
            <button
              className="control-btn"
              onClick={() => showPolyline(processedData.polylines.length - 1)}
              disabled={!processedData.polylines}
            >
              ⏭
            </button>
          </div>
          {currentPolyline && (
            <div className="current-polyline">
              Polyline {playback.currentIndex + 1}/{processedData.polylines.length} • {currentPolyline.pointCount} pts • Len: {currentPolyline.euclideanLength.toFixed(2)} • {currentPolyline.cellIds?.length || 0} cells
            </div>
          )}
          <div className="control-group">
            <label>
              Mesh Transparency: <span>{Math.round(settings.meshOpacity * 100)}</span>%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.meshOpacity * 100}
              onChange={(e) => onSettingsChange({ meshOpacity: parseFloat(e.target.value) / 100 })}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              className="stitch-btn"
              onClick={handleStitchSlit}
              disabled={!processedData.polyLineArray}
            >
              STITCH SLIT
            </button>
            {stitchDone && cleanedPolyData && (
              <button
                className="stitch-btn"
                onClick={() => {handleDownloadVTK({vtkFileName: 'repaired.vtk'})}}
                style={{ marginTop: 8 }}
              >
                SAVE CLEAN VTK
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;

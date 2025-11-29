import React, { useRef, useEffect } from 'react';
import { GEOMETRY_TOLERANCES } from '../renderConfig';

function Sidebar({ settings, onSettingsChange, onFileSelect, onProcess, geometry, processedData, playback, onPlaybackChange }) {
  const fileInputRef = useRef(null);
  const playIntervalRef = useRef(null);
  const playbackRef = useRef(playback);
  const processedDataRef = useRef(processedData);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onFileSelect(file);
    }
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
          onClick={onProcess}
          disabled={!geometry}
          style={{
            width: '100%',
            padding: '10px',
            background: geometry ? '#404040' : '#2a2a2a',
            border: '1px solid #555',
            borderRadius: '4px',
            color: geometry ? '#e0e0e0' : '#666',
            cursor: geometry ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            transition: 'background 0.2s'
          }}
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
        <div className="control-group">
          <label>Corner Color</label>
          <input
            type="color"
            value={settings.cornerColor}
            onChange={(e) => onSettingsChange({ cornerColor: e.target.value })}
          />
        </div>
        <div className="control-group">
          <label>Polyline Color</label>
          <input
            type="color"
            value={settings.polylineColor}
            onChange={(e) => onSettingsChange({ polylineColor: e.target.value })}
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
              Cell Transparency: <span>{Math.round(settings.cellOpacity * 100)}</span>%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.cellOpacity * 100}
              onChange={(e) => onSettingsChange({ cellOpacity: parseFloat(e.target.value) / 100 })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;

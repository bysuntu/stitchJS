import React, { useRef, useEffect } from 'react';

function Sidebar({ settings, onSettingsChange, onFileSelect, onProcess, geometry, processedData, playback, onPlaybackChange }) {
  const fileInputRef = useRef(null);
  const playIntervalRef = useRef(null);

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
    if (!processedData?.polylines) return;
    const clampedIndex = Math.max(0, Math.min(index, processedData.polylines.length - 1));
    onPlaybackChange({ currentIndex: clampedIndex });

    // Log polyline details
    const polyline = processedData.polylines[clampedIndex];
    console.log(`\n=== Polyline ${clampedIndex + 1}/${processedData.polylines.length} ===`);
    console.log(`Points: ${polyline.pointCount}, Length: ${polyline.euclideanLength}`);
    console.log(`Point IDs: [${polyline.pointIds.join(', ')}]`);
  };

  // Handle playback
  useEffect(() => {
    if (playback.isPlaying && processedData?.polylines) {
      playIntervalRef.current = setInterval(() => {
        onPlaybackChange(prev => {
          const nextIndex = (prev.currentIndex + 1) % processedData.polylines.length;
          showPolyline(nextIndex);
          return { currentIndex: nextIndex };
        });
      }, playback.speed);
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [playback.isPlaying, playback.speed, processedData, onPlaybackChange]);

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

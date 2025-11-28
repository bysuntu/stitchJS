import React, { useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import STLViewer from './components/STLViewer';
import Sidebar from './components/Sidebar';
import './App.css';

function App() {
  const [stlFile, setSTLFile] = useState(null);
  const [geometry, setGeometry] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [shouldProcess, setShouldProcess] = useState(false);
  const [settings, setSettings] = useState({
    angleThreshold: 30,
    proximityTolerance: 1e-5,
    meshColor: '#808080',
    boundaryColor: '#ff0000',
    cornerColor: '#00ff00',
    polylineColor: '#00ffff',
    wireframeColor: '#ffffff',
    showMesh: true,
    showWireframe: true,
    showBoundary: true,
    showCorners: true,
    showPolylines: true,
    meshOpacity: 1.0,
    cellOpacity: 1.0,
  });
  const [playback, setPlayback] = useState({
    currentIndex: -1,
    isPlaying: false,
    speed: 1000,
  });

  const handleFileSelect = useCallback((file) => {
    setSTLFile(file);
    setGeometry(null);
    setProcessedData(null);
    setShouldProcess(false);
    setPlayback({ currentIndex: -1, isPlaying: false, speed: 1000 });
  }, []);

  const handleGeometryLoaded = useCallback((loadedGeometry) => {
    setGeometry(loadedGeometry);
    setShouldProcess(false);
  }, []);

  const handleProcessClick = useCallback(() => {
    setShouldProcess(true);
  }, []);

  const handleProcess = useCallback((data) => {
    setProcessedData(data);
    setShouldProcess(false);
    if (data.polylines && data.polylines.length > 0) {
      setPlayback(prev => ({ ...prev, currentIndex: 0 }));
    }
  }, []);

  const handleSettingsChange = useCallback((newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const handlePlaybackChange = useCallback((newPlayback) => {
    setPlayback(prev => ({ ...prev, ...newPlayback }));
  }, []);

  return (
    <div className="app-container">
      <Sidebar
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onFileSelect={handleFileSelect}
        onProcess={handleProcessClick}
        geometry={geometry}
        processedData={processedData}
        playback={playback}
        onPlaybackChange={handlePlaybackChange}
      />
      <div className="viewer-container">
        <Canvas
          camera={{ position: [2, 2, 2], fov: 50 }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={['#0a0a0a']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <OrbitControls makeDefault />
          <STLViewer
            stlFile={stlFile}
            settings={settings}
            shouldProcess={shouldProcess}
            onGeometryLoaded={handleGeometryLoaded}
            onProcess={handleProcess}
            playback={playback}
          />
        </Canvas>
      </div>
    </div>
  );
}

export default App;

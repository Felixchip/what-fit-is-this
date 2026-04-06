import React from 'react';
import './ScannerDisplay.css';

export default function ScannerDisplay({ imageSrc, isScanning, results }) {
  if (!imageSrc) return null;

  return (
    <div className="scanner-container">
      <img src={imageSrc} alt="Target subject" className="scanner-img" />
      
      {isScanning && (
        <>
          <div className="scanner-sweep"></div>
          <div className="scanner-text glitch-hover blink">ANALYZING // TARGET_IDENTIFICATION...</div>
        </>
      )}

      {results && results.length > 0 && !isScanning && (
        <div className="scanner-results-overlay">
          {results.map((item, index) => {
            // Fake positions for aesthetic purposes, clustered around center
            const top = 20 + Math.random() * 50;
            const left = 20 + Math.random() * 50;
            
            return (
              <div 
                key={index} 
                className={`target-box ${item.confidence === 'high' ? 'border-green' : 'border-amber'}`}
                style={{ top: `${top}%`, left: `${left}%` }}
              >
                <div className="target-label">
                  ID: {item.category.toUpperCase().substring(0,4)}_{Math.floor(Math.random()*1000)}<br/>
                  {item.brand ? item.brand.toUpperCase() : 'UNKNOWN'} <br/>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Aesthetic Corners */}
      <div className="corner top-left"></div>
      <div className="corner top-right"></div>
      <div className="corner bottom-left"></div>
      <div className="corner bottom-right"></div>
    </div>
  );
}

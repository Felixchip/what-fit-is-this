import React, { useState, useEffect } from 'react';
import './HUDOverlay.css';

export default function HUDOverlay({ children }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="brutalist-container">
      {/* Top Left Title Area */}
      <div className="title-area">
        <h1 className="main-title">What fit<br/>is this?</h1>
        <div className="rec-indicator">
          <div className="rec-dot"></div>
          <span className="rec-text">REC</span>
          <span className="rec-time">{time}</span>
        </div>
      </div>

      {/* Structural Brackets */}
      <div className="bracket top-right"></div>
      <div className="bracket bottom-left"></div>

      {/* Main Content Area */}
      <div className="main-content">
        {children}
      </div>

      {/* Author Tag */}
      <div className="author-tag">
        <div className="author-text">
          <span>Made by</span><br/>
          <a href="https://felixobinna.com" target="_blank" rel="noreferrer" style={{color: 'inherit', textDecoration: 'none'}}>
            Felix Obinna
          </a>
        </div>
        <div className="author-bracket"></div>
      </div>
    </div>
  );
}

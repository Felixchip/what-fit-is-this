import React, { useState, useEffect } from 'react';
import './HUDOverlay.css'; // We'll add some specific CSS here

export default function HUDOverlay({ children }) {
  const [time, setTime] = useState(new Date().toISOString());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toISOString());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hud-container">
      <div className="scanlines"></div>
      
      {/* Top HUD elements */}
      <div className="hud-top-bar">
        <div className="hud-brand">
          <span className="text-green glitch-hover">WHAT FIT IS THIS</span> // v2.0
        </div>
        <div className="hud-status">
          <div className="status-dot blink"></div>
          <span>SYSTEM ONLINE</span>
        </div>
      </div>

      <div className="hud-info-left">
        <div>SYS_TIME: {time}</div>
        <div className="text-amber">TARGET_LOCK: STABLE</div>
        <div>MEM_USAGE: {(Math.random() * 20 + 30).toFixed(1)}%</div>
      </div>

      <div className="hud-info-right uppercase">
        <h1 className="title-massive">Get<br/>Weird.</h1>
      </div>

      <div className="hud-crosshair center"></div>

      <div className="hud-content">
        {children}
      </div>

      {/* Bottom HUD elements */}
      <div className="hud-bottom-bar">
        <span>AWAITING INPUT_SEQ...</span>
        <span className="text-red">UNAUTHORIZED ACCESS LOGGED</span>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { getStoreLinks } from './ResultsPanel';
import './ScannerDisplay.css';

const BACKEND = import.meta.env.VITE_API_URL || 'https://what-fit-is-this-production.up.railway.app';


export default function ScannerDisplay({ imageSrc, isScanning, results }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [lensResults, setLensResults] = useState({});
  const [productImages, setProductImages] = useState({});  // { index: url | null (loading) | '' (failed) }
  const [pixelEdgePath, setPixelEdgePath] = useState(null);
  const [particles, setParticles] = useState([]);
  const [renderedImgSize, setRenderedImgSize] = useState({ width: 0, height: 0 });
  const [scanProgress, setScanProgress] = useState(0);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!containerRef.current || isScanning) return;
    
    // Throttle style updates with requestAnimationFrame for buttery smooth performance
    if (rafRef.current) return;
    
    rafRef.current = requestAnimationFrame(() => {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      
      containerRef.current.style.setProperty('--mouse-x', x);
      containerRef.current.style.setProperty('--mouse-y', y);
      rafRef.current = null;
    });
  };

  const handleMouseLeave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    
    if (containerRef.current) {
      containerRef.current.style.setProperty('--mouse-x', 0.5);
      containerRef.current.style.setProperty('--mouse-y', 0.5);
    }
  };

  // Track the rendered image dimensions precisely using ResizeObserver
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const updateSize = () => {
      setRenderedImgSize({ width: img.offsetWidth, height: img.offsetHeight });
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(img);
    img.addEventListener('load', updateSize);
    updateSize();
    return () => { ro.disconnect(); img.removeEventListener('load', updateSize); };
  }, [imageSrc]);

  // Build boxes when results + image are ready
  useEffect(() => {
    if (!results || results.length === 0 || !imageSrc) {
      setBoxes([]);
      setLensResults({});
      setProductImages({});
      return;
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Build raw boxes with crop thumbnails
      const raw = results.map((item, index) => {
        let startX = 0, startY = 0, actualW = 0, actualH = 0;
        // Positional defaults
        let finalPosY = typeof item.posY === 'number' ? Math.min(Math.max(item.posY, 0), 100) : 50;
        let finalPosX = typeof item.posX === 'number' ? Math.min(Math.max(item.posX, 0), 100) : 50;
        const randId = Math.floor(Math.random() * 1000);

        // Robust LLM coordinate format detection (immune to 0-1, 0-100, and 0-1000 hallucination)
        if (item.boundingBox && item.boundingBox.length === 4) {
          const [b0, b1, b2, b3] = item.boundingBox;
          
          const maxVal = Math.max(b0, b1, b2, b3);
          let scale = 1000.0;
          if (maxVal <= 1.0) scale = 1.0;
          else if (maxVal <= 100.0) scale = 100.0;

          const nYmin = Math.max(b0, 0) / scale;
          const nXmin = Math.max(b1, 0) / scale;
          const nYmax = Math.min(b2, scale) / scale;
          const nXmax = Math.min(b3, scale) / scale;
          
          let pStartY = nYmin * img.height;
          let pStartX = nXmin * img.width;
          let pEndY = nYmax * img.height;
          let pEndX = nXmax * img.width;

          // Compute absolute center of AI's target coordinate
          const cy = (pStartY + pEndY) / 2;
          const cx = (pStartX + pEndX) / 2;

          // Force the UI dot to explicitly lock to this geometric center
          finalPosY = (cy / img.height) * 100;
          finalPosX = (cx / img.width) * 100;

          // Calculate minimum viable contextual crop area to absorb LLM spatial drift
          const rawW = pEndX - pStartX;
          const rawH = pEndY - pStartY;
          
          // Minimum acceptable capture window is 18% of frame, or 1.5x the raw bounding box
          const targetW = Math.max(rawW * 1.5, img.width * 0.18);
          const targetH = Math.max(rawH * 1.5, img.height * 0.18);

          // Center the final crop mathematically on the target point
          startX = Math.max(0, cx - targetW / 2);
          startY = Math.max(0, cy - targetH / 2);
          
          // Constrain against natural image bounds
          const endX = Math.min(img.width, startX + targetW);
          const endY = Math.min(img.height, startY + targetH);
          
          actualW = endX - startX;
          actualH = endY - startY;

          // Fallback sanity check against inverted boxes
          if (actualW <= 0 || actualH <= 0) {
            actualW = 100; actualH = 100;
          }
        } else {
          // Crop a region around the anchor point (fallback)
          const cropPct = 0.18;
          const cropSize = Math.max(80, Math.min(img.width, img.height) * cropPct);
          const pixelX = (finalPosX / 100) * img.width;
          const pixelY = (finalPosY / 100) * img.height;
          startX = Math.max(0, pixelX - cropSize / 2);
          startY = Math.max(0, pixelY - cropSize / 2);
          actualW = Math.min(cropSize, img.width - startX);
          actualH = Math.min(cropSize, img.height - startY);
        }

        let croppedDataUrl = null;
        if (actualW > 0 && actualH > 0) {
          const cc = document.createElement('canvas');
          cc.width = actualW; cc.height = actualH;
          cc.getContext('2d').drawImage(canvas, startX, startY, actualW, actualH, 0, 0, actualW, actualH);
          croppedDataUrl = cc.toDataURL('image/jpeg');
        }

        return { item, posY: finalPosY, posX: finalPosX, randId, index, croppedDataUrl };
      });

      // Sort all items by Y position first so they appear top-to-bottom
      raw.sort((a, b) => a.posY - b.posY);
      
      // Stacked Arc layout — distribute cards in a partially overlapping fan at the bottom
      const numItems = raw.length;
      const span = Math.PI * 0.5; // Wider arc for better spacing
      const startAngle = (Math.PI - span) / 2; // Offset to center the arc at the bottom
      const angleStep = span / Math.max(numItems - 1, 1);
      
      const radiusX = 42; // Wider horizontal spread
      const radiusY = 45; // Keep depth radius constant

      const positioned = raw.map((box, i) => {
        const angle = startAngle + (i * angleStep);
        const floatX = 50 + Math.cos(angle) * radiusX;
        const floatY = 118 - Math.sin(angle) * radiusY; // Pushed 20% lower for deep bottom placement
        const relativePos = i / Math.max(numItems - 1, 1) - 0.5;
        return {
          ...box,
          floatX,
          floatY,
          tiltY: relativePos * 40,
          tiltX: -10,
          floatScale: 0.95 + (Math.abs(relativePos) * 0.1),
          floatDuration: 4 + Math.random() * 2,
          depth: (i % 3) + 1,
          stackOrder: i
        };
      });

      // Sort by X position for sequential left-to-right reveal
      positioned.sort((a, b) => a.floatX - b.floatX);
      
      // Assign sequential delays for "one at a time" effect
      positioned.forEach((box, i) => {
        box.floatDelay = i * 0.4; // 0.4s interval per card
      });

      setBoxes(positioned);
    };
    img.src = imageSrc;
  }, [results, imageSrc]);

  // Simulate progress when scanning
  useEffect(() => {
    let interval;
    if (isScanning) {
      setScanProgress(0);
      interval = setInterval(() => {
        setScanProgress(prev => {
          // Slow down as we get closer to 99
          const increment = prev < 80 ? 2 : prev < 95 ? 0.5 : 0.1;
          const next = prev + increment;
          return next > 99 ? 99 : next;
        });
      }, 100);
    } else if (results) {
      setScanProgress(100);
    }
    return () => clearInterval(interval);
  }, [isScanning, results]);

  // Execute True Visual Lens Scrapes
  useEffect(() => {
    if (!boxes.length) return;
    
    boxes.forEach(box => {
        if (!box.croppedDataUrl) return;
        if (lensResults[box.index] !== undefined) return; // already queued/completed
        
        // Mark as loading instantly
        setLensResults(prev => ({ ...prev, [box.index]: null }));
        
        fetch(`${BACKEND}/lens-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: box.croppedDataUrl })
        })
        .then(res => res.json())
        .then(data => {
            setLensResults(prev => ({ ...prev, [box.index]: data.exactLink || '' }));
        })
        .catch(err => {
            console.error('[lens] err', err);
            setLensResults(prev => ({ ...prev, [box.index]: '' }));
        });
    });
  }, [boxes, lensResults]);

  // Fetch real product images from Google Shopping
  useEffect(() => {
    if (!boxes.length) return;

    boxes.forEach(box => {
      if (productImages[box.index] !== undefined) return; // already queued/completed

      // Mark as loading
      setProductImages(prev => ({ ...prev, [box.index]: null }));

      fetch(`${BACKEND}/product-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: box.item.searchQuery || '',
          fallbackQuery: box.item.retailSearchQuery || '',
        }),
      })
        .then(res => res.json())
        .then(data => {
          setProductImages(prev => ({ ...prev, [box.index]: data.imageUrl || '' }));
        })
        .catch(err => {
          console.error('[product-img] err', err);
          setProductImages(prev => ({ ...prev, [box.index]: '' }));
        });
    });
  }, [boxes, productImages]);

  // Generate pixelated edge clip-path + scatter particles when scan completes
  useEffect(() => {
    if (!results || results.length === 0 || isScanning) {
      setPixelEdgePath(null);
      setParticles([]);
      return;
    }

    // Generate blocky staircase clip-path
    const blockSize = 3; // percentage units per block step
    const edgeDepth = 8; // max inward depth of pixelation in %
    const points = [];

    // Top edge: left to right
    for (let x = 0; x <= 100; x += blockSize) {
      const indent = Math.random() * edgeDepth;
      points.push(`${x}% ${indent}%`);
      points.push(`${Math.min(x + blockSize, 100)}% ${indent}%`);
    }

    // Right edge: top to bottom
    for (let y = 0; y <= 100; y += blockSize) {
      const indent = 100 - Math.random() * edgeDepth;
      points.push(`${indent}% ${y}%`);
      points.push(`${indent}% ${Math.min(y + blockSize, 100)}%`);
    }

    // Bottom edge: right to left
    for (let x = 100; x >= 0; x -= blockSize) {
      const indent = 100 - Math.random() * edgeDepth;
      points.push(`${x}% ${indent}%`);
      points.push(`${Math.max(x - blockSize, 0)}% ${indent}%`);
    }

    // Left edge: bottom to top
    for (let y = 100; y >= 0; y -= blockSize) {
      const indent = Math.random() * edgeDepth;
      points.push(`${indent}% ${y}%`);
      points.push(`${indent}% ${Math.max(y - blockSize, 0)}%`);
    }

    setPixelEdgePath(`polygon(${points.join(', ')})`);

    // Generate scattered particle squares (Aggressive pruning for 60fps stability)
    const particleCount = 80 + Math.floor(Math.random() * 40);
    const newParticles = [];
    for (let i = 0; i < particleCount; i++) {
      // Clustering Logic: 
      // Bias particles toward image boundaries (e.g. 15% and 85%) for disintegration effect
      let px, py;
      let driftX = 0;
      let driftY = 0;
      const distribution = Math.random();
      
      if (distribution < 0.2) {
        // Internal distress (20% - on the image itself, dense clustering)
        px = 25 + Math.random() * 50;
        py = 25 + Math.random() * 50;
      } else {
        // Edge disintegration (80%)
        const edge = Math.random();
        // Use power functions to cluster near the subject and fade into empty space
        if (edge < 0.1) {
          // Near top (10%)
          px = Math.random() * 100;
          py = (1 - Math.pow(Math.random(), 2)) * 18; 
          driftY = -1; // Drift UP
        } else if (edge < 0.2) {
          // Near bottom (10%)
          px = Math.random() * 100;
          py = 82 + Math.pow(Math.random(), 2) * 18; 
          driftY = 1; // Drift DOWN
        } else if (edge < 0.6) {
          // Near left (40%)
          px = (1 - Math.pow(Math.random(), 2)) * 18; // Cluster near 18
          py = Math.random() * 100;
          driftX = -1; // Drift LEFT
        } else {
          // Near right (40%)
          px = 82 + Math.pow(Math.random(), 2) * 18; // Cluster near 82
          py = Math.random() * 100;
          driftX = 1; // Drift RIGHT
        }
      }

      const size = 3 + Math.random() * 8;
      const opacity = 0.2 + Math.random() * 0.6;
      const isOutline = true; // All pixels are outlines
      newParticles.push({ px, py, size, opacity, isOutline, driftX, driftY, id: `glitch-${i}` });
    }

    // Add tiny "Digital Noise" micro-particles (Balanced density)
    const noiseCount = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < noiseCount; i++) {
      newParticles.push({
        px: Math.random() * 100,
        py: Math.random() * 100,
        size: Math.random() > 0.5 ? 1 : 2,
        opacity: 0.1 + Math.random() * 0.3,
        isOutline: false,
        isNoise: true,
        driftX: Math.random() > 0.5 ? 1 : -1,
        driftY: Math.random() > 0.5 ? 1 : -1,
        id: `noise-${i}`
      });
    }

    setParticles(newParticles);
  }, [results, isScanning]);

  if (!imageSrc) return null;

  const statusMessages = [
    'ANALYZING_SUBJECT_GEOMETRY',
    'DECODING_FASHION_SIGNATURES',
    'MAPPING_SILHOUETTE_DATA',
    'CALIBRATING_OPTICS',
    'EXTRACTION_IN_PROGRESS',
    'FINALIZING_DATA_STREAM'
  ];
  const currentMsg = statusMessages[Math.floor((scanProgress / 100) * statusMessages.length)] || statusMessages[statusMessages.length - 1];

  return (
    <div 
      className={`scanner-container ${pixelEdgePath ? 'scan-complete' : ''}`} 
      ref={containerRef} 
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        '--mouse-x': 0.5,
        '--mouse-y': 0.5,
      }}
    >
      
      {/* Scattered pixel particles */}
      {particles.length > 0 && (
        <div className="pixel-particles">
          {particles.map(p => (
            <div
              key={p.id}
              className={`pixel-particle ${p.isOutline ? 'outline' : 'filled'} ${p.isNoise ? 'noise' : ''}`}
              style={{
                left: `${p.px}%`,
                top: `${p.py}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                opacity: p.opacity,
                '--drift-x': p.driftX,
                '--drift-y': p.driftY,
              }}
            />
          ))}
        </div>
      )}

      {/* Wrapper ensures the overlay coordinates perfectly map to the image's DOM size, regardless of aspect ratio */}
      <div
        className={`scanner-view-port ${pixelEdgePath ? 'pixelated-edge-wrapper' : ''}`}
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          maxHeight: '100%',
          clipPath: pixelEdgePath || 'none',
        }}
      >
        <img ref={imgRef} src={imageSrc} alt="Target subject" className="scanner-img" />

        {isScanning && (
          <div className="scanner-status-overlay">
            <div className="scanner-grid" />
            
            {/* AR HUD Brackets */}
            <div className="hud-bracket tl" />
            <div className="hud-bracket tr" />
            <div className="hud-bracket bl" />
            <div className="hud-bracket br" />

            <div className="scanner-sweep" />

            <div className="progress-container">
              <div className="progress-label glitch-hover">
                <span className="tech-msg">{currentMsg}</span>
                <span className="blink tech-percent">{Math.round(scanProgress)}%</span>
              </div>
              <div className="progress-bar-outer">
                <div className="progress-bar-inner" style={{ width: `${scanProgress}%` }}>
                  <div className="progress-scanner-glitch" />
                </div>
              </div>
            </div>
          </div>
        )}

        {boxes.length > 0 && !isScanning && (
          <div className="scanner-results-overlay">
            {boxes.map(({ item, posY, posX, index }) => (
              <div
                key={`anchor-${index}`}
                className={`anchor-point ${item.confidence === 'high' ? 'border-green anchor-green' : 'border-amber anchor-amber'}`}
                style={{ top: `${posY}%`, left: `${posX}%`, zIndex: 2 }}
              />
            ))}
          </div>
        )}

      </div> {/* End inner wrapper */}

      {/* Floating glassmorphic item cards */}
      {boxes.length > 0 && !isScanning && (
        <div className="floating-cards-layer" style={{ perspective: '800px' }}>
          {boxes.map(({ item, randId, index, croppedDataUrl, floatX, floatY, tiltX, tiltY, floatScale, floatDelay, floatDuration, depth, stackOrder }) => (
            <div
              key={`card-${index}`}
              className={`floating-card depth-${depth}`}
              style={{
                left: `${floatX}%`,
                top: `${floatY}%`,
                transform: `perspective(800px) translate(-50%, -50%) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${floatScale})`,
                zIndex: 100 + stackOrder,
              }}
            >
              <div 
                className="card-float-wrapper"
                style={{
                  animationDelay: `${floatDelay}s`,
                  animationDuration: `${floatDuration}s`,
                }}
              >
                <div className="card-reticle" />
                <div className="clickable-hitbox" onClick={() => setSelectedItem({ ...item, _boxIndex: index })} />

                {/* Thumbnail */}
                {(croppedDataUrl || productImages[index]) && (() => {
                  const hasProductImg = productImages[index] && productImages[index].startsWith('http');
                  const isLoadingProduct = productImages[index] === null;
                  const displaySrc = hasProductImg ? productImages[index] : croppedDataUrl;
                  const shimmerClass = isLoadingProduct ? 'loading-product' : '';

                  return (
                    <div className={`floating-card-thumb ${shimmerClass}`}>
                      <img src={displaySrc} alt={`${item.name}`} />
                    </div>
                  );
                })()}

                {/* Card info */}
                <div className="floating-card-info">
                  <div className="floating-card-brand">{item.brand?.toUpperCase() || 'UNKNOWN'}</div>
                  <div className="floating-card-name">{item.name}</div>
                  <div className="floating-card-price">
                    ${item.priceMin} — ${item.priceMax}
                  </div>
                </div>

                {/* Confidence badge */}
                <div className={`floating-card-conf ${item.confidence}`}>
                  {item.confidence === 'high' ? '● LOCKED' : '○ EST'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedItem && (
        <div className="scanner-modal-backdrop" onClick={() => setSelectedItem(null)}>
          <div className="scanner-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedItem(null)}>[X]</button>

            <div className="text-green" style={{ fontSize: '10px', marginBottom: '8px', letterSpacing: '2px' }}>
              // MATCH_DETAILS_{selectedItem.category.toUpperCase()}
            </div>

            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px' }}>{selectedItem.name}</h3>
            <div className="text-amber" style={{ marginBottom: '12px', fontSize: '12px' }}>
              BRND: {selectedItem.brand?.toUpperCase() || 'UNKNOWN'}
            </div>

            <p className="text-muted" style={{ fontSize: '12px', lineHeight: '1.4', marginBottom: '16px' }}>
              {selectedItem.description}
            </p>

            <div style={{ fontSize: '14px', marginBottom: '12px' }}>
              EST. RETAIL // <span className="text-amber">${selectedItem.priceMin} - ${selectedItem.priceMax}</span>
            </div>

            {selectedItem && (
              <div className="text-green glitch-hover" style={{ fontSize: '10px', marginTop: '12px', letterSpacing: '1px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span>{'>'} BUY_OPTS:</span>
                
                {lensResults[selectedItem._boxIndex] === null ? (
                    <span className="blink text-amber"> [ 🔍 UPLOADING CROP TO VISUAL SEARCH... ]</span>
                ) : (
                    <>
                        {lensResults[selectedItem._boxIndex] && lensResults[selectedItem._boxIndex].startsWith('http') && (
                            <a href={lensResults[selectedItem._boxIndex]} target="_blank" rel="noreferrer" style={{ color: '#000', background: 'var(--green)', padding: '2px 4px', textDecoration: 'none', fontWeight: 'bold' }}>
                                [ 🔍 EXACT MATCH IN GOOGLE LENS ]
                            </a>
                        )}
                        
                        {getStoreLinks(selectedItem.buyLocations, selectedItem).map((linkData, i) => (
                          <a key={i} href={linkData.url} target="_blank" rel="noreferrer" style={
                            linkData.isExact 
                            ? { color: '#000', background: 'var(--green)', padding: '2px 4px', textDecoration: 'none', fontWeight: 'bold' } 
                            : { color: 'var(--green)', textDecoration: 'none', borderBottom: '1px solid var(--green)' }
                          }>
                            {linkData.label}
                          </a>
                        ))}
                    </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="corner top-left" />
      <div className="corner top-right" />
      <div className="corner bottom-left" />
      <div className="corner bottom-right" />
    </div>
  );
}

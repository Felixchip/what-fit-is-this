import React, { useState, useRef } from 'react';
import HUDOverlay from './components/HUDOverlay';
import ScannerDisplay from './components/ScannerDisplay';
import ResultsPanel from './components/ResultsPanel';
import FrameTimeline from './components/FrameTimeline';
import './App.css';

const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [videoUrl, setVideoUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState('');

  // Frames from video extraction
  const [frames, setFrames] = useState([]);
  const [timestamps, setTimestamps] = useState([]);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  // Currently displayed image
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [mimeType, setMimeType] = useState('image/jpeg');

  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  const resetAll = () => {
    setImageSrc(null);
    setBase64Data(null);
    setFrames([]);
    setTimestamps([]);
    setActiveFrameIndex(0);
    setResults([]);
    setError('');
    setExtractMsg('');
  };

  const loadFrame = (frames, index) => {
    const b64 = frames[index];
    setBase64Data(b64);
    setImageSrc('data:image/jpeg;base64,' + b64);
    setResults([]);
    setError('');
    setActiveFrameIndex(index);
  };

  const applyExtractedFrames = (receivedFrames, receivedTimestamps) => {
    setFrames(receivedFrames);
    setTimestamps(receivedTimestamps || []);
    setActiveFrameIndex(0);
    loadFrame(receivedFrames, 0);
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  /** Direct image file upload — no frame extraction needed */
  const handleImageFile = (file) => {
    resetAll();
    setImageSrc(URL.createObjectURL(file));
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => setBase64Data(ev.target.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  /** Local video file upload → /extract-upload */
  const handleVideoFile = async (file) => {
    resetAll();
    setIsExtracting(true);
    setExtractMsg('UPLOADING_VIDEO...');

    try {
      const formData = new FormData();
      formData.append('video', file);

      const res = await fetch(`${BACKEND}/extract-upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');

      const receivedFrames = data.frames || [];
      if (receivedFrames.length === 0) throw new Error('No fashion frames found in video');

      applyExtractedFrames(receivedFrames, data.timestamps);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsExtracting(false);
      setExtractMsg('');
    }
  };

  /** Dispatches image vs video local file */
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type.startsWith('video/')) {
      handleVideoFile(file);
    } else {
      handleImageFile(file);
    }
  };

  /** Social media URL extraction → /extract */
  const handleVideoExtract = async () => {
    if (!videoUrl) return;
    resetAll();
    setIsExtracting(true);
    setExtractMsg('DOWNLOADING + FILTERING_FRAMES...');

    try {
      const res = await fetch(`${BACKEND}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract video');

      const receivedFrames = data.frames || [];
      if (receivedFrames.length === 0) throw new Error('No fashion frames found in video');

      applyExtractedFrames(receivedFrames, data.timestamps);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to connect. Is backend running?');
    } finally {
      setIsExtracting(false);
      setExtractMsg('');
    }
  };

  /** Run full Claude Sonnet analysis on the selected frame */
  const handleScan = async () => {
    if (!base64Data) return;
    setIsScanning(true);
    setError('');
    setResults([]);

    try {
      const res = await fetch(`${BACKEND}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, mimeType }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');

      let parsedResults = [];
      try {
        const clean = data.result.replace(/```json|```/g, '').trim();
        parsedResults = JSON.parse(clean);
      } catch {
        const match = data.result.match(/\[[\s\S]*\]/);
        if (match) parsedResults = JSON.parse(match[0]);
        else throw new Error('Could not parse results');
      }

      setResults(parsedResults);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to analyze. Confirm backend is running.');
    } finally {
      setIsScanning(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  const hasContent = imageSrc || frames.length > 0;

  return (
    <HUDOverlay>
      {/* ── Landing / input screen ── */}
      {!hasContent && !isExtracting && (
        <div className="dashed-container">
          <h2 className="brutalist-section-title">DROP THE FIT</h2>
          <p className="brutalist-subtitle">PASTE IG OR TIKTOK VIDEO URL ...</p>

          <div className="brutalist-input-row">
            <input
              type="url"
              className="brutalist-text-input"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVideoExtract()}
              placeholder="https://tiktok.com/@..."
            />
            <button className="brutalist-btn btn-green" disabled={isExtracting || !videoUrl} onClick={handleVideoExtract}>
              EXTRACT
            </button>
          </div>

          <div className="brutalist-divider" />

          <button className="brutalist-btn btn-green full-width" onClick={() => fileInputRef.current?.click()}>
            UPLOAD PHOTO / VIDEO FILE
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*,video/*"
            style={{ display: 'none' }}
          />

          {error && <div className="error-msg text-red" style={{ marginTop: '24px' }}>{error}</div>}
        </div>
      )}

      {/* ── Extracting state ── */}
      {isExtracting && (
        <div className="extracting-state">
          <div className="extracting-spinner" />
          <div className="extracting-label blink">{extractMsg || 'PROCESSING...'}</div>
          <div className="extracting-sub">AI IS SCANNING FOR FASHION FRAMES</div>
        </div>
      )}

      {/* ── Main workspace ── */}
      {hasContent && !isExtracting && (
        <div className="workspace">
          <div className="sticky-interface">
            <ScannerDisplay
              imageSrc={imageSrc}
              isScanning={isScanning}
              results={results}
            />

            {/* Frame timeline — only when frames available */}
            {frames.length > 0 && (
              <FrameTimeline
                frames={frames}
                timestamps={timestamps}
                activeIndex={activeFrameIndex}
                onSelect={(idx) => {
                  loadFrame(frames, idx);
                }}
              />
            )}

            {/* Scan / error controls */}
            <div className="controls">
              {!isScanning && results.length === 0 && (
                <button className="btn" onClick={handleScan} disabled={!base64Data}>
                  [ EXECUTE_SCAN ]
                </button>
              )}
              {error && (
                <div className="error-msg text-red blink">ERR: {error}</div>
              )}
              {/* Always show reset so user can restart without needing to scroll */}
              <button className="btn reset-btn" onClick={resetAll}>
                [ RESET_SYSTEM ]
              </button>
            </div>
          </div>

          <ResultsPanel results={results} />
        </div>
      )}
    </HUDOverlay>
  );
}

export default App;

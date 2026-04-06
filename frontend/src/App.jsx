import React, { useState, useRef } from 'react';
import HUDOverlay from './components/HUDOverlay';
import ScannerDisplay from './components/ScannerDisplay';
import ResultsPanel from './components/ResultsPanel';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [videoUrl, setVideoUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [frames, setFrames] = useState([]);
  
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  
  const fileInputRef = useRef(null);

  const resetAll = () => {
    setImageSrc(null);
    setBase64Data(null);
    setFrames([]);
    setResults([]);
    setError('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    resetAll();
    setImageSrc(URL.createObjectURL(file));
    setMimeType(file.type);

    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target.result.split(',')[1];
      setBase64Data(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoExtract = async () => {
    if (!videoUrl) return;
    setIsExtracting(true);
    setError('');
    
    try {
      const response = await fetch('http://localhost:3000/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: videoUrl })
      });
      
      const data = await response.json();
      if (!response.ok) {
         throw new Error(data.error || 'Failed to extract video');
      }

      const receivedFrames = data.frames || [];
      if (receivedFrames.length > 0) {
        setFrames(receivedFrames);
        selectFrame(receivedFrames[0]);
      } else {
        throw new Error('No frames returned');
      }
      
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to connect. Is backend running?');
    } finally {
      setIsExtracting(false);
    }
  };

  const selectFrame = (b64) => {
    setBase64Data(b64);
    setImageSrc('data:image/jpeg;base64,' + b64);
    setResults([]);
    setError('');
  };

  const handleScan = async () => {
    if (!base64Data) return;
    setIsScanning(true);
    setError('');
    setResults([]);

    try {
      const response = await fetch('http://localhost:3000/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: base64Data,
          mimeType: mimeType
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server error');
      }

      let parsedResults = [];
      try {
        const raw = data.result;
        const clean = raw.replace(/```json|```/g, '').trim();
        parsedResults = JSON.parse(clean);
      } catch (parseErr) {
        const match = data.result.match(/\[[\s\S]*\]/);
        if (match) {
          parsedResults = JSON.parse(match[0]);
        } else {
          throw new Error('Could not parse results');
        }
      }

      setResults(parsedResults);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to analyze image. Confirm backend is running.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <HUDOverlay>
      {!imageSrc && frames.length === 0 && (
        <div className="upload-container hud-panel">
          <h2 className="text-green uppercase glitch-hover" style={{marginBottom: '16px'}}>// INITIALIZE SYSTEM</h2>
          
          <div className="tabs">
             <button className={`tab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
               UPLOAD
             </button>
             <button className={`tab ${activeTab === 'url' ? 'active' : ''}`} onClick={() => setActiveTab('url')}>
               SOCIAL URL
             </button>
          </div>

          {activeTab === 'upload' && (
            <div style={{width: '100%'}}>
              <p className="text-muted" style={{marginBottom: '24px'}}>UPLOAD FILE FOR DATA PROCESSING.</p>
              <button className="btn" style={{width: '100%'}} onClick={() => fileInputRef.current?.click()}>
                [ SELECT_FILE ]
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
            </div>
          )}

          {activeTab === 'url' && (
            <div style={{width: '100%'}}>
              <p className="text-muted" style={{marginBottom: '16px'}}>PASTE IG OR TIKTOK URL.</p>
              <div className="input-row">
                 <input 
                   type="url" 
                   className="text-input" 
                   value={videoUrl}
                   onChange={e => setVideoUrl(e.target.value)}
                   placeholder="https://www.tiktok.com/@..."
                 />
                 <button className="btn" disabled={isExtracting} onClick={handleVideoExtract} style={{padding: '8px', fontSize: '16px'}}>
                   {isExtracting ? 'RCV...' : 'EXTRACT'}
                 </button>
              </div>
            </div>
          )}

          {error && <div className="error-msg text-red blink mt-4">{error}</div>}
        </div>
      )}

      {(imageSrc || frames.length > 0) && (
        <div className="workspace">
          <ScannerDisplay 
            imageSrc={imageSrc} 
            isScanning={isScanning} 
            results={results} 
          />
          
          {frames.length > 0 && (
             <div className="frame-section">
                <div className="frame-section-title">SELECT TARGET FRAME_</div>
                <div className="frame-strip">
                   {frames.map((frame, index) => (
                      <img 
                        key={index}
                        src={`data:image/jpeg;base64,${frame}`}
                        className={`frame-thumb ${base64Data === frame ? 'active' : ''}`}
                        onClick={() => selectFrame(frame)}
                        alt={`frame ${index}`}
                      />
                   ))}
                </div>
             </div>
          )}

          <div className="controls">
            {(!isScanning && results.length === 0) && (
              <button className="btn" onClick={handleScan} disabled={!base64Data}>
                [ EXECUTE_SCAN ]
              </button>
            )}
            
            {error && (
              <div className="error-msg text-red blink">
                ERR: {error}
              </div>
            )}
          </div>

          <ResultsPanel results={results} />
          
          {(results.length > 0 || error || frames.length > 0) && (
             <button className="btn reset-btn" onClick={resetAll}>
               [ RESET_SYSTEM ]
             </button>
          )}
        </div>
      )}
    </HUDOverlay>
  );
}

export default App;

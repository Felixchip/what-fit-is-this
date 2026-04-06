import React from 'react';
import './ResultsPanel.css';

export default function ResultsPanel({ results }) {
  if (!results || results.length === 0) return null;

  return (
    <div className="results-container">
      <div className="results-header">
        <h2 className="text-green uppercase glitch-hover" style={{fontFamily: 'var(--display)', letterSpacing: '4px'}}>
          [MATCHES_FOUND: {results.length}]
        </h2>
        <div className="line-break"></div>
      </div>

      <div className="results-grid">
        {results.map((item, index) => {
          const confidenceColor = item.confidence === 'high' ? 'green' 
                                  : item.confidence === 'medium' ? 'amber' 
                                  : 'red';

          const searchQ = encodeURIComponent(item.searchQuery || item.name || '');

          return (
            <div key={index} className="result-card hud-panel">
              <div className="result-card-top">
                <span className="result-category">:: {item.category} ::</span>
                <span className={`result-confidence text-${confidenceColor}`}>
                  CONF_{item.confidence?.toUpperCase() || 'LOW'}
                </span>
              </div>
              
              <div className="result-body">
                <div className="result-brand">{item.brand?.toUpperCase() || 'UNKNOWN'}</div>
                <h3 className="result-name">{item.name}</h3>
                
                <div className="result-price-row">
                  <span className="price-label">EST. RETAIL //</span>
                  <span className="price-val text-amber">
                    {item.priceMin && item.priceMax ? `$${item.priceMin} - $${item.priceMax}` : 'N/A'}
                  </span>
                </div>
                
                <div className="result-desc text-muted">
                  {item.description}
                </div>
              </div>

              <div className="result-actions">
                <a href={`https://www.google.com/search?q=${searchQ}&tbm=shop`} target="_blank" rel="noreferrer" className="action-link">
                  [ GOOGLE_SHOP ]
                </a>
                <a href={`https://stockx.com/search?s=${searchQ}`} target="_blank" rel="noreferrer" className="action-link">
                  [ STOCKX ]
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

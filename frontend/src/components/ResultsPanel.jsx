import React from 'react';
import './ResultsPanel.css';

export const fixUndefined = (str) => {
  if (!str) return '';
  return str.replace(/undefined/gi, '').trim();
};

export const getExactQuery = (item) => {
  const brand = fixUndefined(item.brand);
  const name = fixUndefined(item.name);
  return `${brand} ${name}`.trim() || fixUndefined(item.searchQuery) || 'fashion item';
};

export const getStoreLinks = (locations, item) => {
  const links = [];
  const exactQ = getExactQuery(item);

  if (!locations || !Array.isArray(locations) || locations.length === 0) {
      links.push({
        label: 'GOOGLE SHOPPING',
        url: `https://www.google.com/search?q=${encodeURIComponent(exactQ)}&tbm=shop`,
        isExact: false
      });
      return links;
  }
  
  locations.forEach(loc => {
    const l = fixUndefined(loc).toLowerCase();
    if (!l) return;
    
    const label = `BUY ON ${loc.toUpperCase()}`;
    const enc = encodeURIComponent(exactQ);
    
    if (l.includes('zara')) links.push({ label, url: `https://www.zara.com/us/en/search?searchTerm=${enc}`, isExact: true });
    else if (l.includes('gucci')) links.push({ label, url: `https://www.gucci.com/us/en/search?search-query=${enc}`, isExact: true });
    else if (l.includes('louis vuitton') || l.includes('lv')) links.push({ label: 'BUY ON LOUIS VUITTON', url: `https://us.louisvuitton.com/eng-us/search?q=${enc}`, isExact: true });
    else if (l.includes('amazon')) links.push({ label, url: `https://www.amazon.com/s?k=${enc}`, isExact: true });
    else if (l.includes('grailed')) links.push({ label, url: `https://www.grailed.com/shop?query=${enc}`, isExact: true });
    else if (l.includes('depop')) links.push({ label, url: `https://www.depop.com/search/?q=${enc}`, isExact: true });
    else if (l.includes('ssense')) links.push({ label, url: `https://www.ssense.com/en-us/everything?q=${enc}`, isExact: true });
    else if (l.includes('farfetch')) links.push({ label, url: `https://www.farfetch.com/search/?q=${enc}`, isExact: true });
    else if (l.includes('stockx')) links.push({ label, url: `https://stockx.com/search?s=${enc}`, isExact: true });
    else if (l.includes('ebay')) links.push({ label, url: `https://www.ebay.com/sch/i.html?_nkw=${enc}`, isExact: true });
    else {
        links.push({ label: `SEARCH SITE: ${loc.toUpperCase()}`, url: `https://www.google.com/search?q=site:${l.replace(/\s+/g, '')}.com ${enc}&tbm=shop`, isExact: false });
    }
  });

  return links;
};

export default function ResultsPanel({ results, isScanning, onBack }) {
  if (!results || results.length === 0) return null;

  const totalMin = results.reduce((acc, curr) => acc + (curr.priceMin || 0), 0);
  const totalMax = results.reduce((acc, curr) => acc + (curr.priceMax || 0), 0);
  const showTotal = totalMax > 0;

  return (
    <div className="results-container">
      <div className="results-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '16px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
          <h2 className="text-green uppercase glitch-hover" style={{fontFamily: 'var(--display)', letterSpacing: '4px', margin: 0}}>
            [MATCHES_FOUND: {results.length}]
          </h2>
          <div className="line-break"></div>
        </div>
        
        {showTotal && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '12px 16px', background: 'rgba(255, 191, 0, 0.05)', border: '1px solid rgba(255, 191, 0, 0.1)', borderLeft: '4px solid var(--amber)' }}>
            <div className="text-amber" style={{ fontSize: '10px', letterSpacing: '2px', paddingBottom: '3px' }}>// TOTAL_FIT_VALUE_EST:</div>
            <div className="text-amber" style={{ fontSize: '24px', fontFamily: 'var(--display)', lineHeight: '1' }}>
              ${totalMin.toLocaleString()} - ${totalMax.toLocaleString()}
            </div>
          </div>
        )}

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
                
                
                <div className="result-desc text-muted" style={{marginTop: '12px'}}>
                  {item.description}
                </div>
              </div>

              <div className="result-actions" style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                {getStoreLinks(item.buyLocations, item).map((link, idx) => (
                  <a key={idx} href={link.url} target="_blank" rel="noreferrer" className="action-link" style={{color: 'var(--green)'}}>
                    [ {link.label.replace('BUY ON ', '')} ]
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

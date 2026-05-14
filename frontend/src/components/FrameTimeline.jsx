import React from 'react';
import './FrameTimeline.css';

/** Format raw seconds into M:SS */
function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * FrameTimeline
 * Props:
 *   frames      — array of base64 jpeg strings
 *   timestamps  — array of integers (seconds)
 *   activeIndex — currently selected frame index
 *   onSelect    — (index) => void
 */
export default function FrameTimeline({ frames, timestamps, activeIndex, onSelect }) {
  if (!frames || frames.length === 0) return null;

  const total = frames.length;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < total - 1;

  const goPrev = () => hasPrev && onSelect(activeIndex - 1);
  const goNext = () => hasNext && onSelect(activeIndex + 1);

  // Show a sliding window of up to 5 thumbs centred on activeIndex
  const windowSize = 5;
  let winStart = Math.max(0, activeIndex - Math.floor(windowSize / 2));
  const winEnd = Math.min(total, winStart + windowSize);
  winStart = Math.max(0, winEnd - windowSize); // re-clamp
  const visibleIndices = Array.from({ length: winEnd - winStart }, (_, i) => winStart + i);

  return (
    <div className="ft-root">
      {/* Header bar */}
      <div className="ft-header">
        <span className="ft-label">// FRAME_SELECTOR</span>
        <span className="ft-counter">
          {String(activeIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          {timestamps && timestamps[activeIndex] !== undefined && (
            <span className="ft-ts"> — {fmtTime(timestamps[activeIndex])}</span>
          )}
        </span>
        <span className="ft-label">FASHION_DETECTED: {total}</span>
      </div>

      {/* Carousel strip */}
      <div className="ft-strip">
        {/* PREV button */}
        <button
          className={`ft-nav ft-nav-prev ${!hasPrev ? 'ft-nav-disabled' : ''}`}
          onClick={goPrev}
          disabled={!hasPrev}
          aria-label="Previous frame"
        >
          {'<'} PREV
        </button>

        {/* Thumbnail window */}
        <div className="ft-thumbs">
          {visibleIndices.map(idx => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={idx}
                className={`ft-thumb-btn ${isActive ? 'ft-active' : ''}`}
                onClick={() => onSelect(idx)}
                title={timestamps ? `Frame at ${fmtTime(timestamps[idx])}` : `Frame ${idx + 1}`}
              >
                <img
                  src={`data:image/jpeg;base64,${frames[idx]}`}
                  alt={`Frame ${idx + 1}`}
                  className="ft-thumb-img"
                />
                {isActive && <div className="ft-active-pip" />}
                <span className="ft-thumb-ts">
                  {timestamps && timestamps[idx] !== undefined ? fmtTime(timestamps[idx]) : `#${idx + 1}`}
                </span>
              </button>
            );
          })}
        </div>

        {/* NEXT button */}
        <button
          className={`ft-nav ft-nav-next ${!hasNext ? 'ft-nav-disabled' : ''}`}
          onClick={goNext}
          disabled={!hasNext}
          aria-label="Next frame"
        >
          NEXT {'>'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="ft-progress-track">
        <div
          className="ft-progress-fill"
          style={{ width: `${((activeIndex + 1) / total) * 100}%` }}
        />
        {/* Tick marks */}
        {frames.map((_, idx) => (
          <button
            key={idx}
            className={`ft-tick ${idx === activeIndex ? 'ft-tick-active' : ''}`}
            style={{ left: `${(idx / (total - 1 || 1)) * 100}%` }}
            onClick={() => onSelect(idx)}
            aria-label={`Jump to frame ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

import { Icon } from '../../components/Icon';
import { useEffect, useRef } from 'react';

export function TocPanel({ toc, currentIndex, activeEntryIndex = -1, onJump, onClose, docked = false }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeEntryIndex]);

  const panel = (
    <div className={`toc-panel ${docked ? 'toc-panel-docked' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="toc-header">
          <h3>Contents</h3>
          <button className="r-icon-btn" onClick={onClose}>
            <Icon name="close" className="ms sm" />
          </button>
        </div>
        <div className="toc-body">
          {toc.length === 0 && (
            <p style={{ padding: '16px', fontSize: 13, color: 'var(--r-ink2)', margin: 0 }}>
              No table of contents
            </p>
          )}
          {toc.map((entry, i) => (
            <button
              key={i}
              ref={i === activeEntryIndex ? activeRef : null}
              className={`toc-entry ${i === activeEntryIndex || (activeEntryIndex < 0 && entry.index === currentIndex) ? 'active' : ''}`}
              style={{ paddingLeft: `${16 + (entry.level || 0) * 14}px` }}
              onClick={() => onJump(entry, i)}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>{entry.title || `Chapter ${i + 1}`}</span>
              {(entry.play_order > 0 || Number.isFinite(entry.pageIndex)) && (
                <span className="toc-entry-num">{entry.play_order || entry.pageIndex + 1}</span>
              )}
            </button>
          ))}
        </div>
      </div>
  );

  if (docked) {
    return <aside className="toc-dock">{panel}</aside>;
  }

  return (
    <div className="toc-overlay" onClick={onClose}>
      {panel}
    </div>
  );
}

import { Icon } from '../../components/Icon';
import { annotationPageLabel, splitAnnotations } from './readerAnnotations.mjs';

function AnnotationItem({ annotation, onJump, onRemove }) {
  const title = annotation.kind === 'bookmark' ? 'Bookmark' : 'Highlight';
  const body = annotation.quote || annotation.note || 'Saved page';

  return (
    <div className={`annotation-item ${annotation.kind}`}>
      <button className="annotation-jump" onClick={() => onJump(annotation)}>
        <span className={`annotation-color-dot ${annotation.color || 'yellow'}`} />
        <span className="annotation-item-main">
          <span className="annotation-item-meta">{annotationPageLabel(annotation)} · {title}</span>
          <span className="annotation-item-text">{body}</span>
          {annotation.quote && annotation.note && (
            <span className="annotation-item-note">{annotation.note}</span>
          )}
        </span>
      </button>
      <button className="annotation-remove" title="Remove" onClick={() => onRemove(annotation)}>
        <Icon name="delete" className="ms sm" />
      </button>
    </div>
  );
}

export function AnnotationPanel({
  annotations,
  activeTab,
  onTabChange,
  onJump,
  onRemove,
  onClose,
  error,
  docked = false,
}) {
  const { bookmarks, highlights } = splitAnnotations(annotations);
  const visible = activeTab === 'bookmarks' ? bookmarks : highlights;

  const panel = (
    <div className={`annotation-panel ${docked ? 'annotation-panel-docked' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="annotation-header">
        <div>
          <h3>Highlights & notes</h3>
          <p>{bookmarks.length} bookmarks · {highlights.length} highlights</p>
        </div>
        <button className="r-icon-btn" onClick={onClose} aria-label="Close annotations">
          <Icon name="close" className="ms sm" />
        </button>
      </div>

      <div className="annotation-tabs" role="tablist" aria-label="Annotation type">
        <button
          className={`annotation-tab bookmark ${activeTab === 'bookmarks' ? 'active' : ''}`}
          onClick={() => onTabChange('bookmarks')}
          role="tab"
          aria-selected={activeTab === 'bookmarks'}
        >
          <Icon name="bookmark_filled" className="ms" />
          <span>Bookmarks</span>
        </button>
        <button
          className={`annotation-tab highlight ${activeTab === 'highlights' ? 'active' : ''}`}
          onClick={() => onTabChange('highlights')}
          role="tab"
          aria-selected={activeTab === 'highlights'}
        >
          <Icon name="ink_highlighter" className="ms" />
          <span>Highlights</span>
        </button>
      </div>

      {error && <div className="annotation-error">{error}</div>}

      <div className="annotation-body">
        {visible.length === 0 ? (
          <div className="annotation-empty">
            <Icon name={activeTab === 'bookmarks' ? 'bookmark_filled' : 'sticky_note'} className="ms" />
            <strong>{activeTab === 'bookmarks' ? 'No bookmarks yet' : 'No highlights or notes'}</strong>
            <span>
              {activeTab === 'bookmarks'
                ? 'Save the current page with the bookmark button.'
                : 'Select text for a quote, or save the page as a note.'}
            </span>
          </div>
        ) : (
          visible.map((annotation) => (
            <AnnotationItem
              key={annotation.id}
              annotation={annotation}
              onJump={onJump}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </div>
  );

  if (docked) {
    return <aside className="annotation-dock">{panel}</aside>;
  }

  return (
    <div className="annotation-overlay" onClick={onClose}>
      {panel}
    </div>
  );
}

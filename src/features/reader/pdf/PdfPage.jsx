import { useEffect, useRef, useState } from 'react';

export function PdfPage({ document, pageNumber, scale }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setStatus('loading');
      renderTaskRef.current?.cancel();
      const page = await document.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);

      const task = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;
      if (!cancelled) setStatus('ready');
    }

    render().catch((error) => {
      if (error?.name !== 'RenderingCancelledException' && !cancelled) {
        setStatus('error');
      }
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [document, pageNumber, scale]);

  return (
    <div className="pdf-page" data-status={status}>
      <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
      {status === 'loading' && <span className="pdf-page-status">Rendering...</span>}
      {status === 'error' && <span className="pdf-page-status">Page render failed</span>}
    </div>
  );
}

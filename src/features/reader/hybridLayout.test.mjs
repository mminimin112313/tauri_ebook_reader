import assert from 'node:assert/strict';

globalThis.window = { innerWidth: 1024, innerHeight: 768 };
globalThis.document = {
  createElement() {
    return {
      getContext() {
        return {
          font: '',
          measureText(text) {
            return { width: text.length * 10 };
          },
        };
      },
    };
  },
};

const { composeHybridPages, pageMetrics } = await import('./hybridLayout.js');

const pages = composeHybridPages({
  blocks: [{ block_type: 'text', text: 'Dark theme canvas text must use the active reader theme ink.' }],
  settings: { columns: 1, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3 },
  title: 'Theme contrast',
});

assert.equal(pages[0].textRuns[0].color, null);

const metrics = pageMetrics({ columns: 2, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3 });
assert.equal(metrics.pageHeight, 548);
assert.equal(metrics.columns, 2);
assert.equal(pageMetrics({ columns: 1, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3 }).pageWidth, 640);
assert.equal(pageMetrics({ columns: 1, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3, side_panel_width: 300 }).pageWidth, 640);
assert.equal(
  pageMetrics({ columns: 2, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3, side_panel_width: 300 }).pageWidth,
  metrics.pageWidth,
  'canonical page geometry must not change when the TOC side panel opens',
);
assert.equal(metrics.cssPageWidth, 'min(1200px, calc(100vw - 80px))');
assert.equal(
  pageMetrics({ columns: 1, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 4 }).cssPageWidth,
  'min(560px, calc(100vw - 80px))',
);

const mixedPages = composeHybridPages({
  blocks: [
    { block_type: 'text', text: 'A short paragraph used to assert text run bounds.' },
    { block_type: 'image', src: 'mock.png', html: '' },
    { block_type: 'table', html: '<table><tr><th>Term</th><th>Source</th><th>Note</th></tr><tr><td>Cell</td><td>Cell</td><td>Cell</td></tr></table>' },
  ],
  settings: { columns: 2, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3 },
  title: 'Bounds',
});

for (const page of mixedPages) {
  for (const run of page.textRuns) {
    assert.ok(run.x >= 0, 'text run starts inside page');
    assert.ok(run.x < metrics.pageWidth, 'text run x remains inside page width');
    assert.ok(run.y <= metrics.pageHeight, 'text run y remains inside page height');
  }
  for (const overlay of page.overlays) {
    assert.ok(overlay.x >= 0, 'overlay starts inside page');
    assert.ok(overlay.x + overlay.width <= metrics.pageWidth, 'overlay width remains inside page width');
    assert.ok(overlay.y + overlay.height <= metrics.pageHeight, 'overlay height remains inside page height');
  }
}

const tableOverlay = mixedPages.flatMap((page) => page.overlays).find((overlay) => overlay.type === 'table');
assert.ok(tableOverlay, 'table overlay exists');
assert.ok(tableOverlay.width <= 860, 'table overlays use a readable maximum width');
assert.ok(tableOverlay.x > 0, 'narrowed table overlay is centered inside the page');

const richMarkdownPages = composeHybridPages({
  blocks: [
    { block_type: 'heading', text: 'Readable Heading', html: '<h1>Readable Heading</h1>' },
    { block_type: 'text', text: 'Body paragraph keeps normal measure.' },
    { block_type: 'mermaid', html: '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>' },
    { block_type: 'footnote', html: '<div class="footnote-definition"><sup>1</sup> Footnote copy</div>' },
  ],
  settings: { columns: 1, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3 },
  title: 'Rich Markdown',
});

const headingRun = richMarkdownPages.flatMap((page) => page.textRuns).find((run) => run.text === 'Readable Heading');
assert.ok(headingRun, 'heading is rendered as a canvas text run');
assert.match(headingRun.font, /700/);
assert.match(headingRun.font, /28px/);

const richOverlays = richMarkdownPages.flatMap((page) => page.overlays);
const mermaidOverlay = richOverlays.find((overlay) => overlay.type === 'mermaid');
assert.ok(mermaidOverlay, 'mermaid blocks are preserved as overlays');
assert.equal(mermaidOverlay.width, 640);
assert.ok(mermaidOverlay.height <= pageMetrics({ columns: 1, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3 }).pageHeight);

const footnoteOverlay = richOverlays.find((overlay) => overlay.type === 'footnote');
assert.ok(footnoteOverlay, 'footnotes are preserved as overlays');
assert.equal(footnoteOverlay.width, 640);

const twoColumnMermaid = composeHybridPages({
  blocks: [{ block_type: 'mermaid', html: '<pre><code class="language-mermaid">sequenceDiagram\\nA->>B: Hello</code></pre>' }],
  settings: { columns: 2, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3 },
  title: 'Mermaid width',
}).flatMap((page) => page.overlays)[0];
assert.ok(twoColumnMermaid.width <= metrics.columnWidth, 'mermaid overlays stay in column flow for two-column page view');
assert.ok(twoColumnMermaid.x >= 0, 'mermaid overlays start inside wide pages');

const inlineTablePages = composeHybridPages({
  blocks: [
    { block_type: 'text', text: 'Lead text should stay on the same page as a small table.' },
    { block_type: 'table', html: '<table><tr><th>A</th><th>B</th></tr><tr><td>One</td><td>Two</td></tr></table>' },
    { block_type: 'text', text: 'Trailing text should continue after the table instead of forcing a new page.' },
  ],
  settings: { columns: 1, font_size: 18, line_height: 1.45, font_family: 'serif', margin_width: 3 },
  title: 'Inline table',
});

assert.equal(inlineTablePages.length, 1, 'small table blocks render with surrounding markdown on the same page');
assert.equal(inlineTablePages[0].overlays[0].type, 'table');
assert.ok(inlineTablePages[0].textRuns.some((run) => run.text.includes('Lead text')));
assert.ok(inlineTablePages[0].textRuns.some((run) => run.text.includes('Trailing text')));

const longBlocks = Array.from({ length: 180 }, (_, index) => ({
  block_type: 'text',
  text: `Paragraph ${index} with enough text to occupy measurable reader layout space and force pagination.`,
}));
const firstPageOnly = composeHybridPages({
  blocks: longBlocks,
  settings: { columns: 1, font_size: 20, line_height: 1.6, font_family: 'serif', margin_width: 3 },
  title: 'Progressive compose',
  maxPages: 1,
});
assert.equal(firstPageOnly.length, 1, 'progressive compose can stop after the first visible page');
assert.ok(firstPageOnly[0].end_block_index < longBlocks.length - 1, 'progressive compose does not walk the whole document');

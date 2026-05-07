import assert from 'node:assert/strict';
import { shouldHandleNativePageWheel } from './useNativePageControls.js';

function targetWithClosest(selectorResult) {
  return {
    closest(selector) {
      assert.equal(
        selector,
        '.toc-panel, .reader-hud, .reader-chrome-top, .settings-panel, .settings-overlay, input, textarea, select, button, a, [role="button"]',
      );
      return selectorResult;
    },
  };
}

assert.equal(shouldHandleNativePageWheel({ target: targetWithClosest(null), deltaY: 32 }), true);
assert.equal(shouldHandleNativePageWheel({ target: targetWithClosest({ className: 'toc-body' }), deltaY: 32 }), false);
assert.equal(shouldHandleNativePageWheel({ target: targetWithClosest({ className: 'reader-hud' }), deltaY: 32 }), false);
assert.equal(shouldHandleNativePageWheel({ target: targetWithClosest(null), deltaY: 4 }), false);

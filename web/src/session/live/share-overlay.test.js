import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { setupShareButton, showShareError, showShareResult } from './share-overlay.js';

function buildDom() {
  return new JSDOM(`
    <body>
      <button id="share-btn">↗ Share</button>
      <div id="share-overlay" class="share-overlay-backdrop" style="display: none;">
        <div id="share-dialog" class="share-dialog">
          <h3 id="share-title"></h3>
          <div id="share-fields">
            <div class="share-field"><label>Gist URL</label><input id="share-gist-url" readonly class="share-url-input" onclick="this.select()"></div>
            <div class="share-field"><label>Preview URL</label><input id="share-preview-url" readonly class="share-url-input" onclick="this.select()"></div>
          </div>
          <p id="share-error-message" class="share-error-message" style="display: none;"></p>
          <div class="share-actions">
            <button id="share-copy-gist" class="share-btn-primary" data-copy-label="Gist">Copy Gist</button>
            <button id="share-copy-preview" class="share-btn-secondary" data-copy-label="Preview">Copy Preview</button>
            <button id="share-close" class="share-btn-secondary">Close</button>
          </div>
        </div>
      </div>
      <div id="share-copy-notice" class="toast-notice"></div>
    </body>
  `);
}

describe('share overlay', () => {
  it('renders share result and copy buttons', () => {
    const dom = buildDom();
    const state = { shareOverlay: null };
    const navigatorImpl = { clipboard: { writeText: vi.fn(() => Promise.resolve()) } };
    setupShareButton({ documentImpl: dom.window.document, fetchImpl: vi.fn(), sessionId: 's', state, escapeHtml: (x) => x, navigatorImpl });
    showShareResult('gist', 'preview', state, { documentImpl: dom.window.document });
    expect(dom.window.document.getElementById('share-title').textContent).toBe('Session Shared');
    expect(dom.window.document.getElementById('share-gist-url').value).toBe('gist');
    expect(dom.window.document.getElementById('share-preview-url').value).toBe('preview');
    expect(dom.window.document.getElementById('share-overlay').style.display).toBe('');
    dom.window.document.getElementById('share-copy-gist').click();
    expect(navigatorImpl.clipboard.writeText).toHaveBeenCalledWith('gist');
    dom.window.document.getElementById('share-close').click();
    expect(state.shareOverlay).toBe(null);
    expect(dom.window.document.getElementById('share-overlay').style.display).toBe('none');
  });

  it('hides overlay and restores clickability of underlying elements', () => {
    const dom = buildDom();
    const state = { shareOverlay: null };
    setupShareButton({ documentImpl: dom.window.document, fetchImpl: vi.fn(), sessionId: 's', state, escapeHtml: (x) => x, navigatorImpl: {} });
    showShareResult('gist', 'preview', state, { documentImpl: dom.window.document });
    expect(dom.window.document.getElementById('share-overlay').style.display).toBe('');
    dom.window.document.getElementById('share-close').click();
    expect(dom.window.document.getElementById('share-overlay').style.display).toBe('none');
    expect(state.shareOverlay).toBe(null);
  });

  it('renders share error', () => {
    const dom = buildDom();
    const state = { shareOverlay: null };
    showShareError('bad', state, { documentImpl: dom.window.document, escapeHtml: (x) => x });
    expect(dom.window.document.getElementById('share-title').textContent).toBe('Share Failed');
    expect(dom.window.document.getElementById('share-error-message').textContent).toBe('bad');
    expect(dom.window.document.getElementById('share-dialog').classList.contains('error')).toBe(true);
    expect(dom.window.document.getElementById('share-fields').style.display).toBe('none');
  });

  it('sets up share button request flow', async () => {
    const dom = buildDom();
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ gistUrl: 'g', previewUrl: 'p' }), { status: 200 })));
    const state = { shareOverlay: null };
    setupShareButton({ documentImpl: dom.window.document, fetchImpl, sessionId: 's id', state, escapeHtml: (x) => x, navigatorImpl: {} });
    dom.window.document.getElementById('share-btn').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchImpl).toHaveBeenCalledWith('/share?id=s%20id', { method: 'POST' });
    expect(dom.window.document.getElementById('share-title').textContent).toBe('Session Shared');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { renderModelUsageBody, showModelUsageModal } from './model-usage-modal.js';

const escapeHtml = (text) => String(text)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatTokens = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

describe('model-usage-modal', () => {
  const mockEntries = [
    {
      type: 'message',
      message: {
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        usage: { input: 5000, output: 2000, cacheRead: 1000, cacheWrite: 500, cost: { input: 0.015, output: 0.006, cacheRead: 0.001, cacheWrite: 0.001 } },
        content: [{ type: 'toolCall' }, { type: 'toolCall' }]
      }
    },
    {
      type: 'message',
      message: {
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        usage: { input: 3000, output: 1000, cacheRead: 500, cacheWrite: 200, cost: { input: 0.009, output: 0.003, cacheRead: 0.0005, cacheWrite: 0.0002 } },
        content: []
      }
    },
    {
      type: 'message',
      message: {
        role: 'assistant',
        model: 'deepseek-v4-pro',
        provider: 'deepseek',
        usage: { input: 1000, output: 500, cost: { input: 0.001, output: 0.0005 } },
        content: [{ type: 'toolCall' }]
      }
    }
  ];

  it('renders body with correct stats', () => {
    const stats = {
      tokens: { input: 9000, output: 3500, cacheRead: 1500, cacheWrite: 700 },
      cost: { input: 0.025, output: 0.0095, cacheRead: 0.0015, cacheWrite: 0.0012 },
      toolCalls: 3,
      models: ['anthropic/claude-sonnet-4-20250514', 'deepseek/deepseek-v4-pro'],
      _entries: mockEntries
    };

    const html = renderModelUsageBody({ stats, escapeHtml, formatTokens });

    expect(html).toContain('Total cost');
    expect(html).toContain('$0.037');
    expect(html).toContain('Tokens');
    expect(html).toContain('Input');
    expect(html).toContain('Output');
    expect(html).toContain('9.0k');
    expect(html).toContain('3.5k');
    expect(html).toContain('Claude Sonnet 4');
    expect(html).toContain('Deepseek V4 Pro');
    expect(html).toContain('Tool calls');
    expect(html).toContain('3');
  });

  it('adds title attribute with raw model name', () => {
    const stats = {
      tokens: { input: 9000, output: 3500, cacheRead: 1500, cacheWrite: 700 },
      cost: { input: 0.025, output: 0.0095, cacheRead: 0.0015, cacheWrite: 0.0012 },
      toolCalls: 3,
      models: ['anthropic/claude-sonnet-4-20250514', 'deepseek/deepseek-v4-pro'],
      _entries: mockEntries
    };

    const html = renderModelUsageBody({ stats, escapeHtml, formatTokens });

    expect(html).toContain('title="anthropic/claude-sonnet-4-20250514"');
    expect(html).toContain('title="deepseek/deepseek-v4-pro"');
  });

  it('filters out zero-token models', () => {
    const stats = {
      tokens: { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: { input: 0.003, output: 0, cacheRead: 0, cacheWrite: 0 },
      toolCalls: 0,
      models: [],
      _entries: [
        {
          type: 'message',
          message: {
            role: 'assistant',
            model: 'unused-model',
            provider: 'test',
            content: []
          }
        }
      ]
    };

    const html = renderModelUsageBody({ stats, escapeHtml, formatTokens });
    expect(html).not.toContain('Unused Model');
  });

  it('handles malformed entries gracefully', () => {
    const stats = {
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      toolCalls: 0,
      models: [],
      _entries: [
        { type: 'message' }, // no .message
        { type: 'message', message: {} }, // no .role
        { type: 'message', message: { role: 'assistant', model: 'x', content: 'not-array' } }, // content is string
      ]
    };

    // Should not throw
    expect(() => renderModelUsageBody({ stats, escapeHtml, formatTokens })).not.toThrow();
  });

  it('escapes XSS in model names', () => {
    const stats = {
      tokens: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      toolCalls: 0,
      models: ['evil/<script>alert(1)</script>'],
      _entries: [
        {
          type: 'message',
          message: {
            role: 'assistant',
            model: 'evil/<script>alert(1)</script>',
            usage: { input: 100 },
            content: []
          }
        }
      ]
    };

    const html = renderModelUsageBody({ stats, escapeHtml, formatTokens });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('filters out zero token rows', () => {
    const stats = {
      tokens: { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: { input: 0.003, output: 0, cacheRead: 0, cacheWrite: 0 },
      toolCalls: 0,
      models: ['test-model'],
      _entries: []
    };

    const html = renderModelUsageBody({ stats, escapeHtml, formatTokens });

    expect(html).toContain('Input');
    expect(html).not.toContain('Output');
    expect(html).not.toContain('Cache read');
    expect(html).not.toContain('Cache write');
  });

  it('showModelUsageModal injects a sheet into the document', () => {
    function makeEl() {
      const el = {
        innerHTML: '',
        firstElementChild: null,
        classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
        addEventListener: vi.fn(),
        remove: vi.fn(),
        focus: vi.fn(),
        appendChild: vi.fn(),
      };
      Object.defineProperty(el, 'innerHTML', {
        get() { return el._html || ''; },
        set(v) {
          el._html = v;
          el.firstElementChild = {
            classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
            addEventListener: vi.fn(),
            remove: vi.fn(),
            focus: vi.fn(),
            querySelectorAll: vi.fn(() => []),
            contains: vi.fn(() => true),
          };
        },
      });
      return el;
    }

    const mockBodyEl = {
      innerHTML: '',
      appendChild: vi.fn(),
      style: {},
    };

    const documentImpl = {
      createElement: vi.fn(() => makeEl()),
      body: { appendChild: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getElementById: vi.fn((id) => {
        if (id && id.endsWith('-body')) return mockBodyEl;
        if (id && id.endsWith('-panel')) return { classList: { add: vi.fn(), remove: vi.fn() }, focus: vi.fn(), querySelectorAll: vi.fn(() => []), contains: vi.fn(() => true) };
        return null;
      }),
      activeElement: { focus: vi.fn() },
    };

    const windowImpl = {
      matchMedia: vi.fn(() => ({ matches: false })),
      setTimeout: vi.fn((fn) => fn()),
      requestAnimationFrame: vi.fn((fn) => fn()),
    };

    showModelUsageModal({
      entries: mockEntries,
      escapeHtml,
      formatTokens,
      documentImpl,
      windowImpl,
      requestAnimationFrameImpl: vi.fn((fn) => fn()),
    });

    expect(documentImpl.createElement).toHaveBeenCalled();
    expect(documentImpl.body.appendChild).toHaveBeenCalled();
  });
});

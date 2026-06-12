import { describe, expect, it, vi } from 'vitest';
import { setupTextareaControls } from './textarea-controls.js';

function createParts() {
  const textarea = document.createElement('textarea');
  const shell = document.createElement('div');
  const form = document.createElement('form');
  form.requestSubmit = vi.fn();
  Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 120 });
  return { textarea, shell, form };
}

describe('setupTextareaControls', () => {
  it('auto-resizes and updates send state on input', () => {
    const parts = createParts();
    const updateSendEnabled = vi.fn();
    const updateComposerHeight = vi.fn();
    setupTextareaControls({
      ...parts,
      updateSendEnabled,
      updateComposerHeight,
      windowImpl: {
        getComputedStyle: () => ({ maxHeight: '200px', minHeight: '48px' }),
      },
    });

    parts.textarea.dispatchEvent(new Event('input'));

    expect(parts.textarea.style.height).toBe('120px');
    expect(updateSendEnabled).toHaveBeenCalled();
    expect(updateComposerHeight).toHaveBeenCalled();
  });

  it('submits on desktop Enter but not mobile Enter', () => {
    const desktop = createParts();
    setupTextareaControls({ ...desktop, isMobileTextInputMode: () => false });
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    desktop.textarea.dispatchEvent(enter);
    expect(desktop.form.requestSubmit).toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(true);

    const mobile = createParts();
    setupTextareaControls({ ...mobile, isMobileTextInputMode: () => true });
    const mobileEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    mobile.textarea.dispatchEvent(mobileEnter);
    expect(mobile.form.requestSubmit).not.toHaveBeenCalled();
    expect(mobileEnter.defaultPrevented).toBe(false);
  });

  it('delegates palette keys before submit handling', () => {
    const parts = createParts();
    const slash = { handleKeydown: vi.fn(() => true) };
    setupTextareaControls({ ...parts, getSlashSelector: () => slash });

    parts.textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    expect(slash.handleKeydown).toHaveBeenCalled();
    expect(parts.form.requestSubmit).not.toHaveBeenCalled();
  });

  it('handles thinking and model shortcuts', () => {
    const parts = createParts();
    const thinking = { cycle: vi.fn() };
    const model = { open: vi.fn() };
    setupTextareaControls({
      ...parts,
      getThinkingSelector: () => thinking,
      getModelSelector: () => model,
    });

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    parts.textarea.dispatchEvent(tab);
    expect(thinking.cycle).toHaveBeenCalled();
    expect(tab.defaultPrevented).toBe(true);

    const ctrlL = new KeyboardEvent('keydown', {
      key: 'l',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    parts.textarea.dispatchEvent(ctrlL);
    expect(model.open).toHaveBeenCalled();
    expect(ctrlL.defaultPrevented).toBe(true);
  });

  it('adds input-multiline on multi-line content and input-collapsed on collapse click', () => {
    const textarea = document.createElement('textarea');
    const shell = document.createElement('div');
    const form = document.createElement('form');
    form.requestSubmit = vi.fn();
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 100 });
    const collapseButton = document.createElement('button');
    const updateComposerHeight = vi.fn();
    setupTextareaControls({
      textarea,
      shell,
      form,
      collapseInputButton: collapseButton,
      updateComposerHeight,
      windowImpl: {
        getComputedStyle: () => ({
          maxHeight: '200px',
          minHeight: '36px',
          lineHeight: '18px',
          paddingTop: '10px',
          paddingBottom: '10px',
        }),
      },
    });

    // multi-line content triggers input-multiline (100 > 18+20+2 = 40)
    expect(shell.classList.contains('input-multiline')).toBe(true);

    // clicking collapse button adds input-collapsed
    collapseButton.click();
    expect(shell.classList.contains('input-collapsed')).toBe(true);

    // focus removes input-collapsed
    textarea.dispatchEvent(new Event('focus'));
    expect(shell.classList.contains('input-collapsed')).toBe(false);
  });

  it('typing removes input-collapsed class', () => {
    const textarea = document.createElement('textarea');
    const shell = document.createElement('div');
    const form = document.createElement('form');
    form.requestSubmit = vi.fn();
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 100 });
    const collapseButton = document.createElement('button');
    setupTextareaControls({
      textarea,
      shell,
      form,
      collapseInputButton: collapseButton,
      windowImpl: {
        getComputedStyle: () => ({
          maxHeight: '200px',
          minHeight: '36px',
          lineHeight: '18px',
          paddingTop: '10px',
          paddingBottom: '10px',
        }),
      },
    });

    collapseButton.click();
    expect(shell.classList.contains('input-collapsed')).toBe(true);

    textarea.value = 'hello';
    textarea.dispatchEvent(new Event('input'));
    expect(shell.classList.contains('input-collapsed')).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createTreeRenderer } from './tree-renderer.js';

function makeRenderer({ navigateTo = vi.fn() } = {}) {
  document.body.innerHTML = '<div id="tree-container"></div><div id="tree-status"></div>';
  const entries = [{ id: 'root' }, { id: 'leaf', parentId: 'root' }];
  const flat = entries.map((entry) => ({ node: { entry, label: entry.id === 'leaf' ? 'L' : undefined }, indent: 0, showConnector: false, isLast: false, gutters: [], isVirtualRootChild: false, multipleRoots: false }));
  const renderer = createTreeRenderer({
    initialLeafId: 'leaf',
    initialTargetId: 'leaf',
    buildTree: () => [],
    buildActivePathIds: () => new Set(['root', 'leaf']),
    flattenTree: () => flat,
    filterNodes: (nodes) => nodes,
    buildTreePrefix: () => '',
    getTreeNodeDisplayHtml: (entry, label) => label ? `[${label}] ${entry.id}` : entry.id,
    findNewestLeaf: (id) => id === 'root' ? 'leaf' : id,
    navigateTo
  });
  return { renderer, navigateTo };
}

describe('tree renderer', () => {
  it('renders tree nodes, active markers, and status', () => {
    const { renderer } = makeRenderer();
    renderer.renderTree();
    expect([...document.querySelectorAll('.tree-node')].map((n) => n.dataset.id)).toEqual(['root', 'leaf']);
    expect(document.querySelector('.tree-node.active')?.dataset.id).toBe('leaf');
    expect(document.getElementById('tree-status').textContent).toBe('2 / 2 entries');
  });

  it('navigates to newest leaf when a node is clicked', () => {
    const { renderer, navigateTo } = makeRenderer();
    renderer.renderTree();
    document.querySelector('[data-id="root"]').click();
    expect(navigateTo).toHaveBeenCalledWith('leaf', 'target', 'root');
  });

  it('updates active classes on rerender without rebuilding nodes', () => {
    const { renderer } = makeRenderer();
    renderer.renderTree();
    renderer.currentTargetId = 'root';
    renderer.currentLeafId = 'root';
    renderer.renderTree();
    expect(document.querySelector('.tree-node.active')?.dataset.id).toBe('root');
  });
});

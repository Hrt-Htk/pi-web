export function createTreeRenderer({
  documentImpl = document,
  windowImpl = window,
  initialLeafId = '',
  initialTargetId = initialLeafId,
  buildTree,
  buildActivePathIds,
  flattenTree,
  filterNodes,
  buildTreePrefix,
  getTreeNodeDisplayHtml,
  findNewestLeaf,
  navigateTo = () => {},
  isMobileLayout = () => false,
  closeSidebar = () => {}
} = {}) {
  let currentLeafId = initialLeafId;
  let currentTargetId = initialTargetId || initialLeafId;
  let treeRendered = false;

  function renderTree() {
    const tree = buildTree();
    const activePathIds = buildActivePathIds(currentLeafId);
    const flatNodes = flattenTree(tree, activePathIds);
    const filtered = filterNodes(flatNodes, currentLeafId);
    const container = documentImpl.getElementById('tree-container');
    if (!container) return { filtered, flatNodes };

    if (!treeRendered) {
      container.innerHTML = '';
      for (const flatNode of filtered) {
        const entry = flatNode.node.entry;
        const isOnPath = activePathIds.has(entry.id);
        const isTarget = entry.id === currentTargetId;
        const div = documentImpl.createElement('div');
        div.className = 'tree-node';
        if (isOnPath) div.classList.add('in-path');
        if (isTarget) div.classList.add('active');
        div.dataset.id = entry.id;

        const prefixSpan = documentImpl.createElement('span');
        prefixSpan.className = 'tree-prefix';
        prefixSpan.textContent = buildTreePrefix(flatNode);

        const marker = documentImpl.createElement('span');
        marker.className = 'tree-marker';
        marker.textContent = isOnPath ? '•' : ' ';

        const content = documentImpl.createElement('span');
        content.className = 'tree-content';
        content.innerHTML = getTreeNodeDisplayHtml(entry, flatNode.node.label);

        div.appendChild(prefixSpan);
        div.appendChild(marker);
        div.appendChild(content);
        div.addEventListener('click', () => {
          if (windowImpl.getSelection?.().toString()) return;
          const leaf = findNewestLeaf(entry.id);
          navigateTo(leaf, 'target', entry.id);
          if (isMobileLayout()) closeSidebar();
        });
        container.appendChild(div);
      }
      treeRendered = true;
    } else {
      const nodes = container.querySelectorAll('.tree-node');
      for (const node of nodes) {
        const id = node.dataset.id;
        const isOnPath = activePathIds.has(id);
        const isTarget = id === currentTargetId;
        node.classList.toggle('in-path', isOnPath);
        node.classList.toggle('active', isTarget);
        const marker = node.querySelector('.tree-marker');
        if (marker) marker.textContent = isOnPath ? '•' : ' ';
      }
    }

    const status = documentImpl.getElementById('tree-status');
    if (status) status.textContent = `${filtered.length} / ${flatNodes.length} entries`;

    setTimeout(() => {
      const activeNode = container.querySelector('.tree-node.active');
      activeNode?.scrollIntoView?.({ block: 'nearest' });
    }, 0);

    return { filtered, flatNodes };
  }

  function forceTreeRerender() {
    treeRendered = false;
    return renderTree();
  }

  return {
    renderTree,
    forceTreeRerender,
    get currentLeafId() { return currentLeafId; },
    set currentLeafId(value) { currentLeafId = value; },
    get currentTargetId() { return currentTargetId; },
    set currentTargetId(value) { currentTargetId = value; },
    get treeRendered() { return treeRendered; },
    set treeRendered(value) { treeRendered = !!value; }
  };
}

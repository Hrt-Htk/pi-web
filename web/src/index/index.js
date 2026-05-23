import { createSessionsPage } from './sessions-page.js';

export { createSessionsPage };

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function runIndexPage({
  documentImpl = document,
  windowImpl = window,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  const page = createSessionsPage({
    root: documentImpl,
    setTimeoutImpl,
    clearTimeoutImpl,
  });

  const searchInput = documentImpl.getElementById('search');
  const modalOverlay = documentImpl.getElementById('modalOverlay');
  const newSessionBtns = Array.from(documentImpl.querySelectorAll('[data-new-session-btn]'));
  const cancelBtn = documentImpl.getElementById('cancelBtn');
  const createBtn = documentImpl.getElementById('createBtn');
  const sessionPathInput = documentImpl.getElementById('sessionPath');
  const recentLocations = documentImpl.getElementById('recentLocations');
  const modalError = documentImpl.getElementById('modalError');

  function showModal() {
    if (modalOverlay) modalOverlay.classList.add('open');
  }

  function hideModal() {
    if (modalOverlay) modalOverlay.classList.remove('open');
    page.modal = false;
  }

  if (searchInput) {
    const debouncedFilter = debounce(() => {
      page.query = searchInput.value;
      page.filter();
    }, 50);
    searchInput.addEventListener('input', debouncedFilter);
  }

  async function openNewSessionModal() {
    showModal();
    page.modal = true;
    const recent = await page.openModal();
    if (recentLocations) {
      recentLocations.innerHTML = '';
      for (const loc of recent) {
        const chip = documentImpl.createElement('span');
        chip.className = 'recent-chip';
        chip.textContent = loc;
        chip.addEventListener('click', () => {
          if (sessionPathInput) {
            sessionPathInput.value = loc;
            page.path = loc;
            sessionPathInput.focus();
          }
        });
        recentLocations.appendChild(chip);
      }
    }
    if (sessionPathInput) sessionPathInput.focus();
  }

  newSessionBtns.forEach((btn) => {
    btn.addEventListener('click', openNewSessionModal);
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) hideModal();
    });
  }

  windowImpl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && page.modal) {
      hideModal();
    }
  });

  if (sessionPathInput) {
    sessionPathInput.addEventListener('input', () => {
      page.path = sessionPathInput.value;
    });
    sessionPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doCreate();
      }
    });
  }

  async function doCreate() {
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';
    }
    if (modalError) modalError.textContent = '';

    await page.create();

    if (createBtn) {
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
    }
    if (modalError) modalError.textContent = page.error || '';
  }

  if (createBtn) {
    createBtn.addEventListener('click', doCreate);
  }

  page.filter();
  page.subscribe();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.getElementById('search')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => runIndexPage());
  } else {
    runIndexPage();
  }
}

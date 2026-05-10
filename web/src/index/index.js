import Alpine from 'alpinejs';
import { createSessionsPage } from './sessions-page.js';

export { createSessionsPage };

if (typeof window !== 'undefined') {
  window.sessionsPage = createSessionsPage;
  if (!window.Alpine) {
    window.Alpine = Alpine;
    Alpine.start();
  }
}

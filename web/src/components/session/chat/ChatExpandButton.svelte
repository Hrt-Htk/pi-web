<script>
  import { icon, Maximize2 } from '../../../shared/icons.js';
  import { t } from '../../../shared/i18n.js';

  let {
    chatAvailable = true,
  } = $props();
</script>

<button type="button" id="pi-chat-expand" class="pi-chat-expand-button" title={t('composer.expand')} aria-label={t('composer.expand')} aria-pressed="false" disabled={!chatAvailable}>{@html icon(Maximize2, { size: 14 })}</button>

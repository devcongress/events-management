<script setup lang="ts">
import { ref } from 'vue';
import { ensureAdminShortLink } from '@/src/lib/api';
import { copyTextToClipboard } from '@/src/lib/clipboard';
import { TICKET_PURCHASE_URL } from '@/short-links/ticket-purchase';

const url = ref('');
const qr = ref('');
const pending = ref(false);
const error = ref('');
const copied = ref(false);

async function prepare() {
  if (pending.value) return;
  pending.value = true;
  error.value = '';

  try {
    const link = await ensureAdminShortLink({ destination: 'conference_ticket_purchase', conference_year: 2026 });
    const { toDataURL } = await import('qrcode');
    const image = await toDataURL(link.url, {
      width: 960, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
    });

    url.value = link.url;
    qr.value = image;
  } catch {
    error.value = 'Unable to prepare the purchase link. Please try again.';
  } finally {
    pending.value = false;
  }
}

async function copy() {
  try {
    await copyTextToClipboard(url.value);
    copied.value = true;
  } catch {
    error.value = 'Unable to copy. Select and copy the link below.';
  }
}
</script>

<template>
  <section class="rounded-lg border border-dc-border bg-dc-paper p-5 lg:col-span-2" aria-labelledby="ticket-purchase-link-title">
    <div class="flex flex-col items-start justify-between gap-6 sm:flex-row">
      <div class="min-w-0 w-full sm:flex-1">
        <h2 id="ticket-purchase-link-title" class="text-xl font-semibold text-dc-ink">Ticket purchase link</h2>
        <p class="mt-2 text-sm text-dc-gray">Share this link or QR code to open the public ticket checkout.</p>
        <p class="mt-2 break-all text-sm text-dc-gray">Destination: <a :href="TICKET_PURCHASE_URL" target="_blank" rel="noopener noreferrer" class="underline underline-offset-4">{{ TICKET_PURCHASE_URL }}</a></p>
        <p class="mt-2 text-sm text-dc-gray">Ticket sales follow the checkout’s current availability.</p>
        <template v-if="url">
          <input :value="url" readonly aria-label="Ticket purchase short link" class="editorial-input mt-4" @focus="($event.target as HTMLInputElement).select()">
          <div class="mt-3 flex flex-wrap gap-3">
            <button type="button" class="purchase-link-control" @click="copy">{{ copied ? 'Copied' : 'Copy link' }}</button>
            <a :href="url" target="_blank" rel="noopener noreferrer" class="purchase-link-control">Open page</a>
            <a :href="qr" download="devcon26-ticket-purchase-qr.png" class="purchase-link-control">Download QR</a>
          </div>
        </template>
        <button v-else type="button" class="purchase-link-control mt-4" :disabled="pending" @click="prepare">{{ pending ? 'Preparing…' : 'Prepare purchase link' }}</button>
        <p v-if="error" class="mt-3 text-sm text-dc-pink" role="alert">{{ error }}</p>
      </div>
      <img v-if="qr" :src="qr" alt="Scan to buy DevCon26 tickets" width="176" height="176" class="max-w-full shrink-0">
    </div>
  </section>
</template>

<style scoped>
.purchase-link-control {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--surface-paper);
  color: #111111;
  font-size: 0.875rem;
  font-weight: 600;
}

.purchase-link-control:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 3px;
}

.purchase-link-control:disabled {
  opacity: 0.5;
}

@media (hover: hover) and (pointer: fine) {
  .purchase-link-control:hover {
    background: var(--surface-warm);
  }
}
</style>

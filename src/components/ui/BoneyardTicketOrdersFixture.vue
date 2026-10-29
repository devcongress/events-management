<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 5 });
</script>

<template>
  <div class="min-w-0">
    <ul class="ticket-order-cards md:hidden">
      <li v-for="row in rows" :key="row" class="ticket-order-card">
        <header>
          <h3>Sample purchaser</h3>
          <p class="ticket-order-card__email">purchaser@example.test</p>
        </header>
        <dl class="ticket-order-card__facts">
          <div><dt>Pass</dt><dd>Regular pass<span class="ticket-order-card__note">1 seat</span></dd></div>
          <div><dt>Amount</dt><dd>GH₵150.00</dd></div>
          <div><dt>Delivery</dt><dd><span class="ticket-order-card__status">Delivered</span></dd></div>
          <div><dt>Check-in</dt><dd>0 / 1</dd></div>
        </dl>
        <button type="button" class="ticket-order-card__open" disabled>View order <span>→</span></button>
      </li>
    </ul>
    <table class="hidden w-full min-w-[720px] text-left text-sm md:table">
      <thead class="border-b border-dc-border font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">
        <tr><th class="px-5 py-3 pr-4">Purchaser</th><th class="px-4 py-3">Pass</th><th class="px-4 py-3 text-right">Amount</th><th class="px-4 py-3">Delivery</th><th class="px-4 py-3">Check-in</th><th class="px-5 py-3 pl-4 text-right">Open details</th></tr>
      </thead>
      <tbody class="divide-y divide-dc-border">
        <tr v-for="row in rows" :key="row">
          <th scope="row" class="px-5 py-4 pr-4 font-normal"><p class="font-semibold text-dc-ink">Sample purchaser</p><p class="mt-1 max-w-[16rem] truncate text-xs text-dc-gray">purchaser@example.test</p></th>
          <td class="px-4 py-4"><p class="font-semibold text-dc-ink">Regular pass</p><p class="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-dc-gray">1 seat</p></td>
          <td class="px-4 py-4 text-right font-semibold text-dc-ink">GH₵150.00</td>
          <td class="px-4 py-4"><span class="rounded-full border border-dc-border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-dc-ink">Delivered</span></td>
          <td class="px-4 py-4 font-mono text-xs font-semibold text-dc-ink">0 / 1</td>
          <td class="px-5 py-4 pl-4 text-right"><button type="button" class="min-h-11 rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase text-dc-gray" disabled>Details</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped src="@/src/styles/ticket-order-cards.css"></style>

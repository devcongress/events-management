<script setup lang="ts">
withDefaults(defineProps<{ rows?: number; panel?: boolean }>(), { rows: 5 });
</script>

<template>
  <div class="ticket-orders-fixture min-w-0" :class="{ 'rounded-lg border border-dc-border bg-dc-paper': panel }">
    <template v-if="panel">
      <header class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-dc-border px-5 py-4">
        <h2 class="text-xl font-semibold text-dc-ink">Ticket orders</h2>
        <button type="button" class="row-span-2 min-h-11 rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase text-dc-gray" disabled>Refresh</button>
        <p class="mt-1 text-sm leading-6 text-dc-gray">Confirmed live payments, including refunded orders.</p>
      </header>
      <div class="flex flex-wrap gap-1.5 border-b border-dc-border px-3 py-3 sm:px-5">
        <button v-for="(label, index) in ['Paid orders', 'Checkout attempts', 'Test orders']" :key="label" type="button" class="min-h-11 whitespace-nowrap rounded-md border px-2.5 py-2 text-sm font-semibold sm:px-3" :class="index === 0 ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border bg-dc-paper text-dc-gray'" disabled>{{ label }}</button>
      </div>
    </template>
    <ul class="ticket-order-cards md:hidden">
      <li v-for="row in rows" :key="row" class="ticket-order-card">
        <header>
          <h3>Sample purchaser</h3>
          <p class="ticket-order-card__email">purchaser@example.test</p>
        </header>
        <dl class="ticket-order-card__facts">
          <div><dt>Pass</dt><dd>Regular pass<span class="ticket-order-card__note">1 seat</span></dd></div>
          <div><dt>Payment</dt><dd>GH₵150.00<span class="ticket-order-card__note">Paid</span></dd></div>
          <div><dt>Latest order email</dt><dd><span>Delivered</span></dd></div>
        </dl>
        <button type="button" class="ticket-order-card__open" disabled>View order <span>→</span></button>
      </li>
    </ul>
    <table class="hidden w-full min-w-[720px] text-left text-sm md:table">
      <thead class="border-b border-dc-border font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">
        <tr><th class="px-5 py-3 pr-4">Purchaser</th><th class="px-4 py-3">Pass</th><th class="px-4 py-3 text-right">Payment</th><th class="px-4 py-3 text-center">Latest order email</th><th class="px-5 py-3 pl-4 text-right"><span class="sr-only">Open details</span></th></tr>
      </thead>
      <tbody class="divide-y divide-dc-border">
        <tr v-for="row in rows" :key="row">
          <th scope="row" class="px-5 py-4 pr-4 font-normal"><p class="font-semibold text-dc-ink">Sample purchaser</p><p class="mt-1 max-w-[16rem] truncate text-xs text-dc-gray">purchaser@example.test</p></th>
          <td class="px-4 py-4"><p class="font-semibold text-dc-ink">Regular pass</p><p class="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-dc-gray">1 seat</p></td>
          <td class="px-4 py-4 text-right font-semibold text-dc-ink">GH₵150.00<span class="block text-xs font-normal text-dc-gray">Paid</span></td>
          <td class="px-4 py-4 text-center text-dc-ink">Delivered</td>
          <td class="px-5 py-4 pl-4 text-right"><button type="button" class="min-h-11 rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase text-dc-gray" disabled>Details</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped src="@/src/styles/ticket-order-cards.css"></style>

<style scoped>
.ticket-orders-fixture {
  font-size: 1.0625rem;
  line-height: 1.65;
}
</style>

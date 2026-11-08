<template>
  <ul class="mt-4 divide-y divide-dc-border" aria-hidden="true" inert>
    <li v-for="row in 3" :key="row" class="flex flex-wrap items-start justify-between gap-3 py-4">
      <div>
        <p class="font-semibold">Ama Mensah</p>
        <p class="break-all text-sm text-dc-gray">ama.mensah@example.test</p>
        <p class="mt-1 text-sm">Issued · Email accepted</p>
        <p class="mt-1 text-sm text-dc-gray">Complimentary guests · Community support</p>
      </div>
      <button type="button" disabled class="min-h-11 px-2 text-sm underline">Cancel ticket</button>
    </li>
  </ul>
</template>

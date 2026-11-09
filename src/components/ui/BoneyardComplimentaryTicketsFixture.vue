<template>
  <table class="w-full table-fixed text-left text-sm" aria-hidden="true" inert>
    <thead>
      <tr class="border-b border-dc-border text-dc-gray">
        <th scope="col" class="px-4 py-3 font-semibold">Guest</th>
        <th scope="col" class="hidden px-4 py-3 font-semibold sm:table-cell">Email</th>
        <th scope="col" class="w-28 px-4 py-3 font-semibold sm:w-40">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in 2" :key="row" class="border-b border-dc-border last:border-0">
        <td class="px-4 py-2"><div class="flex min-h-11 items-center"><p class="font-semibold underline">Ama Mensah</p></div></td>
        <td class="hidden break-all px-4 py-2 sm:table-cell">ama.mensah@example.test</td>
        <td class="break-words px-4 py-2">Issued</td>
      </tr>
    </tbody>
  </table>
</template>

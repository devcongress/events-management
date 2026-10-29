<template>
  <section class="registration-overview">
    <div class="registration-overview-header">
      <h2>Registration overview</h2>
      <div class="registration-overview-header-actions">
        <span class="registration-overview-updated">Updated 10:30 AM</span>
        <button type="button" class="registration-overview-refresh" disabled>Refresh</button>
      </div>
    </div>
    <div class="registration-overview-metrics">
      <div class="registration-overview-primary">
        <p class="registration-overview-figure"><strong>120</strong><span>/ 300</span></p>
        <p>confirmed registrations</p>
      </div>
      <div class="registration-overview-secondary"><strong>180</strong><span>places left</span></div>
    </div>
    <div class="registration-overview-progress-row">
      <div class="registration-overview-progress"><div class="registration-overview-progress-fill" /></div>
      <p>40% filled</p>
    </div>
    <p class="mt-5 text-sm text-dc-gray">12 waitlisted · 120 total reserved, including other admissions and active holds.</p>
  </section>
</template>

<style scoped src="@/src/styles/registration-workspace.css" />

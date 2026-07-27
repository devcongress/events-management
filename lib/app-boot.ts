export const APP_BOOT_STYLES = String.raw`
:root{color:#111;background:#f5f2e8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
html,body,#app{width:100%;min-height:100%;margin:0}
.app-boot{box-sizing:border-box;display:flex;min-height:100vh;min-height:100svh;flex-direction:column;overflow:hidden;background:#f5f2e8}
.app-boot *,.app-boot *::before,.app-boot *::after{box-sizing:border-box}
.app-boot__content{display:grid;width:min(100% - 3rem,80rem);flex:1;align-content:center;margin-inline:auto;padding-block:clamp(3rem,12vh,8rem)}
.app-boot__message{max-width:44rem}
.app-boot__eyebrow{margin:0 0 1rem;color:#e8117f;font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.65rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.app-boot__title{max-width:12ch;margin:0;font-size:clamp(2.75rem,7vw,6.5rem);font-weight:800;letter-spacing:-.045em;line-height:.92}
.app-boot__copy{max-width:32rem;margin:1.5rem 0 0;color:#555;font-size:clamp(1rem,1.5vw,1.2rem);line-height:1.6}
.app-boot__signal{display:grid;width:8rem;height:.35rem;grid-template-columns:4fr 2fr 1fr;gap:.25rem;margin-top:2rem}
.app-boot__signal span{border-radius:999px;background:#f5e642}
.app-boot__signal span:nth-child(2){background:#e8117f}
.app-boot__signal span:nth-child(3){background:#111}
@media(max-width:640px){.app-boot__content{width:min(100% - 2rem,80rem)}}
`;

export const APP_BOOT_MARKUP = String.raw`
<section class="app-boot" role="status" aria-live="polite" aria-label="Opening DevCongress">
  <main class="app-boot__content">
    <div class="app-boot__message">
      <p class="app-boot__eyebrow">Getting things ready</p>
      <h1 class="app-boot__title">Opening the workspace.</h1>
      <p class="app-boot__copy">Checking access and restoring your place.</p>
      <div class="app-boot__signal" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>
  </main>
</section>
`;

export type AppBootVariant =
  | 'organizer'
  | 'registration'
  | 'cfp'
  | 'feedback'
  | 'speaker'
  | 'volunteer'
  | 'learning-room';

export const APP_BOOT_VARIANT_ATTRIBUTE = 'data-app-boot-variant';

const publicBootLabels: Record<Exclude<AppBootVariant, 'organizer'>, string> = {
  registration: 'Loading your registration form',
  cfp: 'Loading the proposal form',
  feedback: 'Loading the feedback form',
  speaker: 'Loading the talk details form',
  volunteer: 'Loading the volunteer form',
  'learning-room': 'Joining the learning room',
};

const organizerBootLabel = 'Opening the DevCongress organizer workspace';

function appBootAriaLabelForVariant(variant: AppBootVariant): string {
  return variant === 'organizer' ? organizerBootLabel : publicBootLabels[variant];
}

export function appBootVariantForPathname(pathname: string): AppBootVariant {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';

  if (path.startsWith('/r/')) return 'registration';
  if (path.startsWith('/register/')) return 'registration';
  if (path.startsWith('/cfp/')) return 'cfp';
  if (path.startsWith('/feedback/')) return 'feedback';
  if (path.startsWith('/speaker-talks/')) return 'speaker';
  if (path.startsWith('/volunteer/')) return 'volunteer';
  if (path.startsWith('/learn/system-design/')) return 'learning-room';

  return 'organizer';
}

const organizerBootMarkup = `
  <div class="app-boot__organizer">
    <div class="app-boot__message">
      <p class="app-boot__eyebrow">Getting things ready</p>
      <h1 class="app-boot__title">Opening the workspace.</h1>
      <p class="app-boot__copy">Checking access and restoring your place.</p>
      <div class="app-boot__signal" aria-hidden="true"><span /><span /><span /></div>
    </div>
  </div>
`;

const publicBootBrandMarkup = `
  <header class="app-boot__public-brand">
    <span class="app-boot__public-mark" aria-hidden="true">DC</span>
    <span class="app-boot__public-brand-copy">
      <strong>DevCongress</strong>
      <span>Community experience</span>
    </span>
  </header>
`;

const publicBootSkeletons: Record<Exclude<AppBootVariant, 'organizer'>, string> = {
  registration: `
    <div class="app-boot__public-layout app-boot__public-layout--registration">
      <div class="app-boot__public-panel app-boot__public-panel--event">
        <div class="app-boot__public-cover app-boot__skeleton" />
        <div class="app-boot__public-event-copy">
          <div class="app-boot__public-eyebrow app-boot__skeleton" />
          <div class="app-boot__public-title app-boot__skeleton" />
          <div class="app-boot__public-line app-boot__skeleton" />
          <div class="app-boot__public-line app-boot__public-line--short app-boot__skeleton" />
          <div class="app-boot__public-meta-grid">
            <div class="app-boot__public-meta-block"><span class="app-boot__public-label app-boot__skeleton" /><span class="app-boot__public-value app-boot__skeleton" /></div>
            <div class="app-boot__public-meta-block"><span class="app-boot__public-label app-boot__skeleton" /><span class="app-boot__public-value app-boot__skeleton" /></div>
          </div>
        </div>
      </div>
      <div class="app-boot__public-panel app-boot__public-panel--form">
        <div class="app-boot__public-form-title app-boot__skeleton" />
        <div class="app-boot__public-field app-boot__skeleton" />
        <div class="app-boot__public-field app-boot__skeleton" />
        <div class="app-boot__public-button app-boot__skeleton" />
      </div>
    </div>
  `,
  cfp: `
    <div class="app-boot__public-layout app-boot__public-layout--form">
      <div class="app-boot__public-heading">
        <div class="app-boot__public-eyebrow app-boot__skeleton" />
        <div class="app-boot__public-title app-boot__skeleton" />
        <div class="app-boot__public-line app-boot__public-line--short app-boot__skeleton" />
      </div>
      <div class="app-boot__public-panel app-boot__public-panel--form">
        <div class="app-boot__public-form-title app-boot__skeleton" />
        <div class="app-boot__public-field app-boot__skeleton" />
        <div class="app-boot__public-field app-boot__skeleton" />
        <div class="app-boot__public-textarea app-boot__skeleton" />
        <div class="app-boot__public-textarea app-boot__public-textarea--short app-boot__skeleton" />
        <div class="app-boot__public-button app-boot__skeleton" />
      </div>
    </div>
  `,
  feedback: `
    <div class="app-boot__public-layout app-boot__public-layout--form">
      <div class="app-boot__public-heading">
        <div class="app-boot__public-eyebrow app-boot__skeleton" />
        <div class="app-boot__public-title app-boot__skeleton" />
        <div class="app-boot__public-line app-boot__public-line--short app-boot__skeleton" />
        <div class="app-boot__public-line app-boot__skeleton" />
      </div>
      <div class="app-boot__public-panel app-boot__public-panel--question">
        <div class="app-boot__public-field app-boot__skeleton" />
        <div class="app-boot__public-options"><span class="app-boot__public-option app-boot__skeleton" /><span class="app-boot__public-option app-boot__skeleton" /><span class="app-boot__public-option app-boot__skeleton" /><span class="app-boot__public-option app-boot__skeleton" /></div>
      </div>
      <div class="app-boot__public-panel app-boot__public-panel--question">
        <div class="app-boot__public-field app-boot__skeleton" />
        <div class="app-boot__public-options"><span class="app-boot__public-option app-boot__skeleton" /><span class="app-boot__public-option app-boot__skeleton" /><span class="app-boot__public-option app-boot__skeleton" /><span class="app-boot__public-option app-boot__skeleton" /></div>
      </div>
      <div class="app-boot__public-button app-boot__skeleton" />
    </div>
  `,
  speaker: `
    <div class="app-boot__public-layout app-boot__public-layout--wide-form">
      <div class="app-boot__public-heading">
        <div class="app-boot__public-eyebrow app-boot__skeleton" />
        <div class="app-boot__public-title app-boot__skeleton" />
        <div class="app-boot__public-line app-boot__public-line--short app-boot__skeleton" />
      </div>
      <div class="app-boot__public-panel app-boot__public-panel--form">
        <div class="app-boot__public-field-grid">
          <div class="app-boot__public-field app-boot__skeleton" />
          <div class="app-boot__public-field app-boot__skeleton" />
        </div>
        <div class="app-boot__public-field app-boot__skeleton" />
        <div class="app-boot__public-field app-boot__skeleton" />
        <div class="app-boot__public-textarea app-boot__skeleton" />
        <div class="app-boot__public-button app-boot__skeleton" />
      </div>
    </div>
  `,
  volunteer: `
    <div class="app-boot__public-layout app-boot__public-layout--volunteer">
      <div class="app-boot__public-heading">
        <div class="app-boot__public-eyebrow app-boot__skeleton" />
        <div class="app-boot__public-title app-boot__skeleton" />
        <div class="app-boot__public-line app-boot__skeleton" />
        <div class="app-boot__public-line app-boot__public-line--short app-boot__skeleton" />
      </div>
      <div class="app-boot__public-panel app-boot__public-panel--form">
        <div class="app-boot__public-form-title app-boot__skeleton" />
        <div class="app-boot__public-field-grid">
          <div class="app-boot__public-field app-boot__skeleton" />
          <div class="app-boot__public-field app-boot__skeleton" />
          <div class="app-boot__public-field app-boot__skeleton" />
          <div class="app-boot__public-field app-boot__skeleton" />
        </div>
        <div class="app-boot__public-button app-boot__skeleton" />
      </div>
    </div>
  `,
  'learning-room': `
    <div class="app-boot__public-layout app-boot__public-layout--learning">
      <div class="app-boot__public-panel app-boot__public-panel--learning">
        <div class="app-boot__public-mark app-boot__skeleton" />
        <div class="app-boot__public-eyebrow app-boot__skeleton" />
        <div class="app-boot__public-title app-boot__skeleton" />
        <div class="app-boot__public-line app-boot__public-line--short app-boot__skeleton" />
        <div class="app-boot__public-field app-boot__skeleton" />
      </div>
    </div>
  `,
};

export const APP_BOOT_STYLES = String.raw`
:root{color:#111;background:#f5f2e8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",ui-sans-serif,system-ui,sans-serif}
html,body,#app{width:100%;min-height:100%;margin:0}
.app-boot{box-sizing:border-box;display:flex;min-height:100vh;min-height:100svh;flex-direction:column;overflow:hidden;background:#f5f2e8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",ui-sans-serif,system-ui,sans-serif}
.app-boot *,.app-boot *::before,.app-boot *::after{box-sizing:border-box}
.app-boot__organizer{display:none;width:min(100% - 3rem,80rem);flex:1;align-content:center;margin-inline:auto;padding-block:clamp(3rem,12vh,8rem)}
.app-boot__message{max-width:44rem}
.app-boot__eyebrow{margin:0 0 .85rem;color:#e8117f;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.65rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.app-boot__title{max-width:14ch;margin:0;font-size:clamp(2.25rem,5.5vw,4.75rem);font-weight:600;letter-spacing:-.035em;line-height:.98}
.app-boot__copy{max-width:32rem;margin:1.25rem 0 0;color:#555;font-size:clamp(.95rem,1.35vw,1.125rem);line-height:1.6}
.app-boot__signal{display:grid;width:8rem;height:.35rem;grid-template-columns:4fr 2fr 1fr;gap:.25rem;margin-top:2rem}
.app-boot__signal span{border-radius:999px;background:#f5e642}
.app-boot__signal span:nth-child(2){background:#e8117f}
.app-boot__signal span:nth-child(3){background:#111}
.app-boot__public{display:none;width:min(100% - 2rem,72rem);margin-inline:auto;padding-block:clamp(1.5rem,7vh,5.5rem)}
.app-boot__public-brand{display:flex;align-items:center;gap:.75rem;margin-bottom:clamp(2rem,6vh,4.5rem)}
.app-boot__public-mark{display:grid;width:2.4rem;height:2.4rem;place-items:center;border:2px solid #111;border-radius:.55rem;background:#f5e642;color:#111;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.7rem;font-weight:700;letter-spacing:.08em}
.app-boot__public-brand-copy{display:grid;gap:.15rem}
.app-boot__public-brand-copy strong{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase}
.app-boot__public-brand-copy span{color:#666;font-size:.82rem}
.app-boot__public-layout{display:grid;gap:1rem}
.app-boot__public-layout--registration{grid-template-columns:minmax(0,1.25fr) minmax(18rem,.75fr);align-items:start}
.app-boot__public-layout--form,.app-boot__public-layout--wide-form,.app-boot__public-layout--volunteer{max-width:56rem}
.app-boot__public-layout--learning{min-height:62vh;place-items:center}
.app-boot__public-heading{display:grid;gap:1rem;margin-bottom:.5rem}
.app-boot__public-panel{border:1px solid #d8d2c6;border-radius:.75rem;background:#fffdf7;box-shadow:3px 3px 0 rgba(17,17,17,.08)}
.app-boot__public-panel--event{overflow:hidden}
.app-boot__public-panel--form,.app-boot__public-panel--question{display:grid;gap:1rem;padding:clamp(1.25rem,3vw,2rem)}
.app-boot__public-panel--learning{display:grid;width:min(100%,28rem);gap:1rem;justify-items:center;padding:2.5rem 2rem;text-align:center}
.app-boot__public-cover{height:clamp(8rem,22vw,15rem);border-bottom:1px solid #d8d2c6;background:#e8e2d6}
.app-boot__public-event-copy{display:grid;gap:.8rem;padding:clamp(1.25rem,3vw,2rem)}
.app-boot__public-eyebrow{width:6.5rem;height:.7rem;border-radius:999px}
.app-boot__public-title{width:min(100%,31rem);height:clamp(2rem,6vw,4.5rem);border-radius:.45rem}
.app-boot__public-form-title{width:min(100%,18rem);height:1.5rem;border-radius:.35rem}
.app-boot__public-line{width:100%;height:.8rem;border-radius:999px}
.app-boot__public-line--short{width:62%}
.app-boot__public-meta-grid,.app-boot__public-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.app-boot__public-meta-block{display:grid;gap:.55rem}
.app-boot__public-label{width:4rem;height:.55rem;border-radius:999px}
.app-boot__public-value{width:85%;height:1rem;border-radius:999px}
.app-boot__public-field{width:100%;height:3.4rem;border:1px solid #d8d2c6;border-radius:.5rem}
.app-boot__public-textarea{width:100%;height:7rem;border:1px solid #d8d2c6;border-radius:.5rem}
.app-boot__public-textarea--short{height:5.5rem}
.app-boot__public-button{width:min(100%,16rem);height:3.4rem;border:1px solid #d8d2c6;border-radius:.5rem;background:#f5e642}
.app-boot__public-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem}
.app-boot__public-option{height:2.8rem;border:1px solid #d8d2c6;border-radius:.5rem}
.app-boot__skeleton{background:#e8e2d6;animation:app-boot-pulse 2.2s cubic-bezier(0.16,1,0.3,1) infinite}
[data-app-boot-variant='organizer'] .app-boot__organizer{display:grid}
[data-app-boot-variant='registration'] [data-app-boot-public='registration'],[data-app-boot-variant='cfp'] [data-app-boot-public='cfp'],[data-app-boot-variant='feedback'] [data-app-boot-public='feedback'],[data-app-boot-variant='speaker'] [data-app-boot-public='speaker'],[data-app-boot-variant='volunteer'] [data-app-boot-public='volunteer'],[data-app-boot-variant='learning-room'] [data-app-boot-public='learning-room']{display:block}
@keyframes app-boot-pulse{0%,100%{opacity:.62}50%{opacity:.9}}
@media(max-width:720px){.app-boot__organizer{width:min(100% - 2rem,80rem)}.app-boot__public{padding-block:1.25rem 2.5rem}.app-boot__public-brand{margin-bottom:2.25rem}.app-boot__public-layout--registration{grid-template-columns:1fr}.app-boot__public-cover{height:9rem}.app-boot__public-meta-grid,.app-boot__public-field-grid{grid-template-columns:1fr}.app-boot__public-options{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){.app-boot__skeleton{animation:none}}
`;

export function renderAppBootMarkup(pathname = '/'): string {
  const variant = appBootVariantForPathname(pathname);
  const ariaLabel = appBootAriaLabelForVariant(variant);

  const publicMarkup = (Object.keys(publicBootSkeletons) as Array<Exclude<AppBootVariant, 'organizer'>>)
    .map((publicVariant) => `
      <div data-app-boot-public="${publicVariant}" class="app-boot__public" aria-hidden="true">
        ${publicBootBrandMarkup}
        ${publicBootSkeletons[publicVariant]}
      </div>
    `)
    .join('');

  return `<!-- devcongress-app-boot:start -->
<section class="app-boot" role="status" aria-live="polite" aria-label="${ariaLabel}" ${APP_BOOT_VARIANT_ATTRIBUTE}="${variant}">
  ${organizerBootMarkup}
  ${publicMarkup}
</section>
<!-- devcongress-app-boot:end -->`;
}

export function applyAppBootVariant(html: string, pathname: string): string {
  const variant = appBootVariantForPathname(pathname);
  return html
    .replace(
      new RegExp(`${APP_BOOT_VARIANT_ATTRIBUTE}="[^"]+"`),
      `${APP_BOOT_VARIANT_ATTRIBUTE}="${variant}"`,
    )
    .replace(
      /(<section class="app-boot"[^>]*aria-label=")[^"]+("[^>]*>)/,
      `$1${appBootAriaLabelForVariant(variant)}$2`,
    );
}

export const APP_BOOT_MARKUP = renderAppBootMarkup('/organizer-console');

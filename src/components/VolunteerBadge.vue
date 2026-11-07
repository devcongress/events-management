<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { paintDigitalBadge } from '@/src/lib/devcon26-digital-badge';
import { canvasPng, saveBadgeFile } from '@/src/lib/speaker-badge';

const props = defineProps<{ displayName?: string | null }>();
const name = ref(props.displayName?.includes('@') ? '' : props.displayName ?? '');
const photo = ref<File | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref('');
const preparing = ref(false);
const validatingPhoto = ref(false);
const prepared = ref<File | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);
const previewName = ref('');
const normalizedName = computed(() => name.value.trim().replace(/\s+/g, ' '));
const canShare = computed(() => Boolean(prepared.value && typeof navigator.share === 'function' && navigator.canShare?.({ files: [prepared.value] })));
let revision = 0;
let photoRevision = 0;
let preparedRevision = -1;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const ready = computed(() => Boolean(prepared.value && preparedRevision === revision && !preparing.value && !validatingPhoto.value && normalizedName.value));

async function refresh(current: number, badgeName: string, badgePhoto: File | null) {
  const draft = document.createElement('canvas');

  try {
    const result = await paintDigitalBadge(draft, badgeName, badgePhoto, undefined, 'volunteer');

    if (!result.valid) throw new Error(result.message);
    const blob = await canvasPng(draft);

    if (current !== revision) return;
    const target = canvas.value;
    const context = target?.getContext('2d');

    if (!target || !context) throw new Error('Unable to preview your badge.');
    if (target.width !== draft.width) target.width = draft.width;
    if (target.height !== draft.height) target.height = draft.height;
    context.drawImage(draft, 0, 0);
    prepared.value = new File([blob], 'devcon26-volunteer.png', { type: 'image/png' });
    preparedRevision = current;
    previewName.value = badgeName;
  } catch (reason) {
    if (current === revision) error.value = reason instanceof Error ? reason.message : 'Unable to prepare your badge.';
  } finally {
    if (current === revision) preparing.value = false;
  }
}

watch([normalizedName, photo], ([badgeName, badgePhoto]) => {
  const current = ++revision;

  clearTimeout(refreshTimer);
  error.value = '';
  preparing.value = Boolean(badgeName);
  if (!badgeName) return;
  refreshTimer = setTimeout(() => { void refresh(current, badgeName, badgePhoto); }, 120);
}, { flush: 'sync', immediate: true });
onBeforeUnmount(() => {
  revision += 1;
  photoRevision += 1;
  clearTimeout(refreshTimer);
});

async function choosePhoto(event: Event) {
  const current = ++photoRevision;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  validatingPhoto.value = false;
  input.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) {
    error.value = 'Choose a JPEG, PNG or WebP photo under 5 MB.';

    return;
  }
  validatingPhoto.value = true;
  try {
    const image = await createImageBitmap(file);
    const valid = image.width > 0 && image.height > 0 && image.width <= 6000 && image.height <= 6000 && image.width * image.height <= 24000000;

    image.close();
    if (current !== photoRevision) return;
    if (!valid) throw new Error('Choose a photo no larger than 24 megapixels.');
    photo.value = file;
  } catch (reason) {
    if (current === photoRevision) error.value = reason instanceof Error ? reason.message : 'Unable to read that photo.';
  } finally {
    if (current === photoRevision) validatingPhoto.value = false;
  }
}

function removePhoto() {
  photoRevision += 1;
  validatingPhoto.value = false;
  photo.value = null;
  error.value = '';
}

function share() {
  const file = prepared.value;

  if (!ready.value || !file || !navigator.canShare?.({ files: [file] })) return;
  void navigator.share({ files: [file], title: 'DevCon26 volunteer badge' }).catch((reason) => {
    if (reason?.name !== 'AbortError') error.value = 'Sharing was unavailable. Download your badge instead.';
  });
}
</script>

<template>
  <section class="volunteer-badge" aria-labelledby="volunteer-badge-title">
    <div class="volunteer-badge__heading">
      <div>
        <h2 id="volunteer-badge-title">Your volunteer badge</h2>
        <p>Create an image to share that you’re volunteering at DevCon26.</p>
      </div>
    </div>
    <div class="volunteer-badge__editor">
      <div class="volunteer-badge__fields">
        <label for="volunteer-badge-name">Display name</label>
        <input id="volunteer-badge-name" v-model="name" class="editorial-input volunteer-badge__name" maxlength="100" autocomplete="name" placeholder="Your name" />
        <p>Your name and optional photo stay in this browser while you use this page. They are not saved when you leave.</p>
        <input ref="photoInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="choosePhoto" />
        <div class="volunteer-badge__actions">
          <button type="button" class="volunteer-badge__secondary motion-press" @click="photoInput?.click()">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="2.5" y="3" width="15" height="14" rx="2" />
              <circle cx="7" cy="7.5" r="1" />
              <path d="m3 14 4-4 3 3 3-4 4 5" />
            </svg>
            {{ photo ? 'Change photo' : 'Add photo' }}
          </button>
          <button v-if="photo" type="button" class="volunteer-badge__secondary motion-press" @click="removePhoto">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 5.5h14m-12 0 .8 10.5a1.5 1.5 0 0 0 1.5 1.5h5.4a1.5 1.5 0 0 0 1.5-1.5L15 5.5m-7-2v2m4-2v2" />
            </svg>
            Remove photo
          </button>
          <button v-if="canShare" type="button" class="volunteer-badge__button motion-press" :disabled="!ready" @click="share">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 12V2.5m-3 3 3-3 3 3m1 3h1a1.5 1.5 0 0 1 1.5 1.5v5.5A1.5 1.5 0 0 1 15 17H5a1.5 1.5 0 0 1-1.5-1.5V10A1.5 1.5 0 0 1 5 8.5h1" />
            </svg>
            Share badge
          </button>
          <button type="button" class="volunteer-badge__secondary motion-press" :disabled="!ready" @click="ready && prepared && saveBadgeFile(prepared, 'devcon26-volunteer.png')">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2.5V13m-3-3 3 3 3-3M3.5 13v2.5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5V13" />
            </svg>
            Download PNG
          </button>
        </div>
        <p class="volunteer-badge__status" :class="{ 'volunteer-badge__error': error }" role="status" aria-live="polite">
          {{ error || (preparing ? 'Preparing preview…' : !normalizedName ? 'Enter a display name to preview your badge.' : '') }}
        </p>
      </div>
      <canvas ref="canvas" width="1080" height="1350" class="volunteer-badge__preview" :class="{ 'volunteer-badge__preview--hidden': !previewName }" role="img" :aria-label="`DevCon26 volunteer badge preview for ${previewName}`" />
    </div>
  </section>
</template>

<style scoped>
.volunteer-badge {
  margin: 1.25rem 0;
  padding: 1.25rem;
  border: 1px solid var(--dc-border, #e0ddd4);
  border-radius: 8px;
  background: #fff;
  color: #111;
}

.volunteer-badge__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.volunteer-badge h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.volunteer-badge p {
  margin: 0.35rem 0 0;
  color: #555;
  font-size: 0.95rem;
}

.volunteer-badge__editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(140px, 240px);
  gap: 1.5rem;
  margin-top: 1.25rem;
}

.volunteer-badge__fields label {
  display: block;
  font-weight: 600;
}

.volunteer-badge__name {
  min-height: 44px;
  margin-top: 0.4rem;
  font-size: 1rem;
}

.volunteer-badge__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.volunteer-badge__button,
.volunteer-badge__secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 44px;
  padding: 0.5rem 1rem;
  border: 1px solid #111;
  border-radius: 6px;
  font-weight: 600;
}

.volunteer-badge__actions svg {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.volunteer-badge__button {
  background: #f5e642;
}

.volunteer-badge__secondary {
  background: #fff;
}

.volunteer-badge button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.volunteer-badge__preview {
  width: 100%;
  height: auto;
  border: 1px solid #e0ddd4;
}

.volunteer-badge__preview--hidden {
  visibility: hidden;
}

.volunteer-badge__status {
  min-height: 1.65em;
}

.volunteer-badge .volunteer-badge__error {
  color: #a21c32;
}

@media (max-width: 600px) {
  .volunteer-badge__editor {
    grid-template-columns: 1fr;
  }

  .volunteer-badge__preview {
    max-width: 240px;
  }
}
</style>

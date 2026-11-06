<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { paintDigitalBadge } from '@/src/lib/devcon26-digital-badge';
import { canvasPng, saveBadgeFile } from '@/src/lib/speaker-badge';

const props = defineProps<{ displayName?: string | null }>();
const open = ref(false);
const name = ref(props.displayName?.includes('@') ? '' : props.displayName ?? '');
const photo = ref<File | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref('');
const preparing = ref(false);
const validatingPhoto = ref(false);
const prepared = ref<File | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);
const canShare = computed(() => Boolean(prepared.value && typeof navigator.share === 'function' && navigator.canShare?.({ files: [prepared.value] })));
let revision = 0;
let photoRevision = 0;

async function refresh() {
  const current = ++revision;

  prepared.value = null;
  error.value = '';
  if (!open.value || !name.value.trim()) {
    preparing.value = false;

    return;
  }
  preparing.value = true;
  const draft = document.createElement('canvas');

  try {
    const result = await paintDigitalBadge(draft, name.value, photo.value, undefined, 'volunteer');

    if (!result.valid) throw new Error(result.message);
    const blob = await canvasPng(draft);

    if (current !== revision) return;
    await nextTick();
    if (current !== revision) return;
    const target = canvas.value;
    const context = target?.getContext('2d');

    if (!target || !context) throw new Error('Unable to preview your badge.');
    target.width = draft.width;
    target.height = draft.height;
    context.drawImage(draft, 0, 0);
    prepared.value = new File([blob], 'devcon26-volunteer.png', { type: 'image/png' });
  } catch (reason) {
    if (current === revision) error.value = reason instanceof Error ? reason.message : 'Unable to prepare your badge.';
  } finally {
    if (current === revision) preparing.value = false;
  }
}

watch([open, name, photo], () => { void refresh(); }, { flush: 'sync' });
onBeforeUnmount(() => { revision += 1; photoRevision += 1; });

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

  if (validatingPhoto.value || !file || !navigator.canShare?.({ files: [file] })) return;
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
      <button type="button" class="volunteer-badge__button motion-press" :aria-expanded="open" @click="open = !open">{{ open ? 'Close editor' : 'Create badge' }}</button>
    </div>
    <div v-if="open" class="volunteer-badge__editor">
      <div class="volunteer-badge__fields">
        <label for="volunteer-badge-name">Display name</label>
        <input id="volunteer-badge-name" v-model="name" class="editorial-input volunteer-badge__name" maxlength="100" autocomplete="name" placeholder="Your name" />
        <p>Your name and optional photo stay in this browser while you use this page. They are not saved when you leave.</p>
        <input ref="photoInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="choosePhoto" />
        <div class="volunteer-badge__actions">
          <button type="button" class="volunteer-badge__secondary motion-press" @click="photoInput?.click()">{{ photo ? 'Change photo' : 'Add photo' }}</button>
          <button v-if="photo" type="button" class="volunteer-badge__secondary motion-press" @click="removePhoto">Remove photo</button>
        </div>
        <p v-if="error" role="alert" class="volunteer-badge__error">{{ error }}</p>
        <p v-else-if="preparing" role="status">Preparing preview…</p>
        <p v-else-if="!name.trim()">Enter a display name to preview your badge.</p>
        <div class="volunteer-badge__actions">
          <button v-if="canShare" type="button" class="volunteer-badge__button motion-press" :disabled="!prepared || validatingPhoto" @click="share">Share badge</button>
          <button type="button" class="volunteer-badge__secondary motion-press" :disabled="!prepared || validatingPhoto" @click="!validatingPhoto && prepared && saveBadgeFile(prepared, 'devcon26-volunteer.png')">Download PNG</button>
        </div>
      </div>
      <canvas ref="canvas" class="volunteer-badge__preview" :class="{ 'volunteer-badge__preview--hidden': !prepared }" role="img" :aria-label="`DevCon26 volunteer badge preview for ${name}`" />
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
  min-height: 44px;
  padding: 0.5rem 1rem;
  border: 1px solid #111;
  border-radius: 6px;
  font-weight: 600;
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

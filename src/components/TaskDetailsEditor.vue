<script setup lang="ts">
import { computed, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { taskDetailsDocument, taskDetailsText, TASK_DETAILS_TEXT_LIMIT, type TaskDetailsFormat, type TaskDetailsNode } from '@/lib/annual-conference-task-details';

const props = defineProps<{ modelValue: string; format?: TaskDetailsFormat; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:format': [value: TaskDetailsFormat] }>();
const editor = useEditor({
  extensions: [StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, link: false, underline: false, trailingNode: false })],
  content: taskDetailsDocument(props.modelValue, props.format),
  editable: !props.disabled,
  editorProps: { attributes: { role: 'textbox', 'aria-label': 'Task details', 'aria-multiline': 'true', 'aria-describedby': 'task-details-help', class: 'task-details-content min-h-48 px-3 py-3 outline-none' } },
  onUpdate: ({ editor }) => {
    emit('update:format', 'rich_text');
    emit('update:modelValue', editor.isEmpty ? '' : JSON.stringify(editor.getJSON()));
  },
});
const count = computed(() => editor.value ? taskDetailsText(editor.value.getJSON() as TaskDetailsNode).length : 0);
defineExpose({ focus: () => editor.value?.commands.focus() });
watch(() => props.disabled, (disabled) => editor.value?.setEditable(!disabled));
watch([() => props.modelValue, () => props.format], () => {
  if (!editor.value || (props.format === 'rich_text' && JSON.stringify(editor.value.getJSON()) === props.modelValue) || (!props.modelValue && editor.value.isEmpty)) return;
  editor.value.commands.setContent(taskDetailsDocument(props.modelValue, props.format), { emitUpdate: false });
});
const actions = [
  { label: 'Bold', mark: 'bold', text: 'B', run: () => editor.value?.chain().focus().toggleBold().run() },
  { label: 'Italic', mark: 'italic', text: 'I', run: () => editor.value?.chain().focus().toggleItalic().run() },
  { label: 'Strikethrough', mark: 'strike', text: 'S', run: () => editor.value?.chain().focus().toggleStrike().run() },
  { label: 'Bullet list', mark: 'bulletList', text: '• List', run: () => editor.value?.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', mark: 'orderedList', text: '1. List', run: () => editor.value?.chain().focus().toggleOrderedList().run() },
];
</script>

<template>
  <div class="mt-2 overflow-hidden rounded-lg border border-dc-border bg-white focus-within:border-dc-pink focus-within:ring-2 focus-within:ring-dc-pink/15">
    <div role="group" aria-label="Text formatting" class="flex flex-wrap gap-1 border-b border-dc-border bg-dc-paper/60 p-2">
      <button v-for="action in actions" :key="action.mark" type="button" :aria-label="action.label" :title="action.label" :aria-pressed="editor?.isActive(action.mark) ?? false" :disabled="disabled" class="min-h-10 min-w-10 rounded-md px-2 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dc-pink" :class="[editor?.isActive(action.mark) ? 'bg-dc-pink/10 text-dc-pink' : 'text-dc-ink', { 'font-bold': action.mark === 'bold', italic: action.mark === 'italic', 'line-through': action.mark === 'strike' }]" @click="action.run">{{ action.text }}</button>
      <button type="button" class="min-h-10 rounded-md px-2 text-sm disabled:opacity-40" :disabled="disabled || !editor?.can().undo()" @click="editor?.chain().focus().undo().run()">Undo</button>
      <button type="button" class="min-h-10 rounded-md px-2 text-sm disabled:opacity-40" :disabled="disabled || !editor?.can().redo()" @click="editor?.chain().focus().redo().run()">Redo</button>
    </div>
    <EditorContent :editor="editor" />
  </div>
  <p id="task-details-help" class="mt-2 text-xs" :class="count > TASK_DETAILS_TEXT_LIMIT ? 'font-semibold text-red-700' : 'text-dc-gray'">{{ count.toLocaleString() }}/2,000 characters · Format text here; add resource links in the task’s Resources section.</p>
</template>

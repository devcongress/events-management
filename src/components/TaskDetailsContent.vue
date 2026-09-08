<script lang="ts">
import { defineComponent, h, type PropType, type VNodeChild } from 'vue';
import { taskDetailsDocument, type TaskDetailsFormat, type TaskDetailsNode } from '@/lib/annual-conference-task-details';

function renderNode(node: TaskDetailsNode): VNodeChild {
  if (node.type === 'text') {
    return (node.marks ?? []).reduce<VNodeChild>((content, mark) => h({ bold: 'strong', italic: 'em', strike: 's' }[mark.type], {}, [content]), node.text ?? '');
  }
  const tags = { doc: 'div', paragraph: 'p', hardBreak: 'br', bulletList: 'ul', orderedList: 'ol', listItem: 'li' };
  return h(tags[node.type], node.type === 'orderedList' ? { start: node.attrs?.start ?? 1, type: node.attrs?.type ?? undefined } : {}, (node.content ?? []).map(renderNode));
}

export default defineComponent({
  props: { value: { type: String, default: '' }, format: { type: String as PropType<TaskDetailsFormat>, default: 'plain_text' } },
  setup(props) {
    return () => {
      if (!props.value) return h('p', { class: 'text-dc-gray' }, 'No task description yet.');
      try { return h('div', { class: 'task-details-content' }, [renderNode(taskDetailsDocument(props.value, props.format))]); }
      catch { return h('p', { class: 'text-dc-gray' }, 'This task description could not be displayed.'); }
    };
  },
});
</script>

<style>
.task-details-content { overflow-wrap: anywhere; white-space: pre-wrap; font-weight: 400; line-height: 1.75; }
.task-details-content p + p { margin-top: .65rem; }
.task-details-content p:empty::before { content: '\00a0'; }
.task-details-content ul, .task-details-content ol { padding-left: 1.5rem; margin-block: .5rem; }
.task-details-content ul { list-style: disc; }
.task-details-content ol { list-style: decimal; }
.task-details-content strong { font-weight: 700; }
</style>

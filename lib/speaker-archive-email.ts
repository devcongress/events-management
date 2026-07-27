import { isSystemDesignSessionItem } from '@/lib/system-design';
import type {
  ArchiveItemKind,
  PublicMeetupScheduleItem,
} from '@/types';

export type ArchiveRequestProgramItem = {
  index: number;
  value: string;
  title: string;
  speakerName: string;
  kind: ArchiveItemKind;
  label: string;
};

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/\s+/g, ' ') ?? '';
}

export function archiveRequestProgramItems(
  schedule: PublicMeetupScheduleItem[] | null | undefined,
): ArchiveRequestProgramItem[] {
  return (schedule ?? []).flatMap((item, index) => {
    const title = item.title.trim();
    const speakerName = item.lead?.trim() ?? '';

    if (
      !title
      || !speakerName
      || /^welcome address\b/i.test(title)
      || isSystemDesignSessionItem(item)
    ) {
      return [];
    }

    return [{
      index,
      value: `program-item-${index}`,
      title,
      speakerName,
      kind: item.type === 'product_demo' ? 'product_demo' : 'talk',
      label: `${title} — ${speakerName}`,
    }];
  });
}

export function sameArchiveProgramItemIdentity(
  link: {
    kind?: ArchiveItemKind;
    speaker_name?: string | null;
    talk_title?: string | null;
  },
  item: {
    kind: ArchiveItemKind;
    speakerName: string;
    title: string;
  },
): boolean {
  return (link.kind === 'product_demo' ? 'product_demo' : 'talk') === item.kind
    && normalizedText(link.speaker_name) === normalizedText(item.speakerName)
    && normalizedText(link.talk_title) === normalizedText(item.title);
}

export function sameArchiveProgramIdentity(
  link: {
    kind?: ArchiveItemKind;
    speaker_name?: string | null;
    speaker_email?: string | null;
    talk_title?: string | null;
  },
  item: {
    kind: ArchiveItemKind;
    speakerName: string;
    speakerEmail: string;
    title: string;
  },
): boolean {
  return sameArchiveProgramItemIdentity(link, item)
    && normalizedText(link.speaker_email) === normalizedText(item.speakerEmail);
}

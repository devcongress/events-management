import { taskDetailsSearchText, type TaskDetailsFormat } from '@/lib/annual-conference-task-details';

type CardDescriptionTask = {
  details: string | null;
  details_format?: TaskDetailsFormat;
  title: string;
};

export function annualConferenceTaskCardDescription(task: CardDescriptionTask): string | null {
  const description = taskDetailsSearchText(task.details, task.details_format)
    .replace(/\s+/g, ' ')
    .trim();

  if (!description || description.toLocaleLowerCase() === task.title.trim().toLocaleLowerCase()) {
    return null;
  }

  return description;
}

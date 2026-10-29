import { conferenceSections } from './conference';
import { generalSections } from './general';

export const skeletonSections = [...generalSections, ...conferenceSections];
const sectionsById = new Map(skeletonSections.map((section) => [section.id, section]));

if (sectionsById.size !== skeletonSections.length) {
  throw new Error('Skeleton section IDs must be unique.');
}

export function getSkeletonSection(id: string) {
  return sectionsById.get(id);
}

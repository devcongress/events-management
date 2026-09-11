import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from 'uuid';
import type { Talk } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return uuidv4();
}

export function now(): string {
  return new Date().toISOString();
}

export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking chars
  let code = '';

  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getSlidesViewUrl(talk: Talk): string | null {
  if (talk.slides_type === 'file' && talk.storage_path) {
    return talk.storage_path;
  }
  if (talk.slides_type === 'url' && talk.slides_url) {
    return talk.slides_url;
  }

  return null;
}

/**
 * Extract unique topics from talks and limit to 2-4 tags
 * Sorted by frequency (most common first)
 */
export function getEventTags(talks: Talk[], min: number = 2, max: number = 4): string[] {
  if (talks.length === 0) return [];

  // Count frequency of each topic
  const topicCounts = new Map<string, number>();

  talks.forEach(talk => {
    if (talk.topic) {
      topicCounts.set(talk.topic, (topicCounts.get(talk.topic) || 0) + 1);
    }
  });

  // Sort by frequency (descending), then alphabetically
  const sortedTopics = Array.from(topicCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // frequency desc

      return a[0].localeCompare(b[0]); // alphabetical
    })
    .map(([topic]) => topic);

  // Return 2-4 tags
  const tagCount = Math.max(min, Math.min(max, sortedTopics.length));

  return sortedTopics.slice(0, tagCount);
}

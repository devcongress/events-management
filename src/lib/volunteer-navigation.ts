import { computed, type ComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export type VolunteerView = 'directory' | 'reviews' | 'campaign';
export type VolunteerCampaignTab = 'updates' | 'outcomes' | 'invitations' | 'settings';

export function resolveVolunteerView(value: unknown, reviews: boolean, campaign: boolean): VolunteerView {
  if (value === 'campaign' && campaign) return 'campaign';
  if (value === 'reviews' && reviews) return 'reviews';

  return 'directory';
}

export function resolveVolunteerCampaignTab(value: unknown): VolunteerCampaignTab {
  return value === 'outcomes' || value === 'invitations' || value === 'settings' ? value : 'updates';
}

export function useVolunteerView(reviews: ComputedRef<boolean>, campaign: ComputedRef<boolean>) {
  const route = useRoute();
  const router = useRouter();

  return computed<VolunteerView>({
    get: () => resolveVolunteerView(route.query.volunteerView, reviews.value, campaign.value),
    set: (value) => {
      const next = resolveVolunteerView(value, reviews.value, campaign.value);

      if (next === resolveVolunteerView(route.query.volunteerView, reviews.value, campaign.value)) return;
      void router.push({ path: route.path, query: { ...route.query, volunteerView: next } });
    },
  });
}

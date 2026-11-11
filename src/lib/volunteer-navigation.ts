import { computed, watch, type ComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export type VolunteerView = 'directory' | 'reviews' | 'campaign';
export type VolunteerCampaignTab = 'updates' | 'outcomes' | 'invitations' | 'settings';

export function resolveVolunteerView(value: unknown, reviews: boolean, campaign: boolean, directory = true): VolunteerView {
  if (value === 'campaign' && campaign) return 'campaign';
  if (value === 'reviews' && reviews) return 'reviews';
  if (value === 'directory' && directory) return 'directory';

  return directory ? 'directory' : reviews ? 'reviews' : campaign ? 'campaign' : 'directory';
}

export function resolveVolunteerCampaignTab(value: unknown): VolunteerCampaignTab {
  return value === 'outcomes' || value === 'invitations' || value === 'settings' ? value : 'updates';
}

export function useVolunteerView(reviews: ComputedRef<boolean>, campaign: ComputedRef<boolean>, directory?: ComputedRef<boolean>, ready?: ComputedRef<boolean>) {
  const route = useRoute();
  const router = useRouter();

  watch(() => [route.query.volunteerView, reviews.value, campaign.value, directory?.value, ready?.value], () => {
    if (!ready?.value || route.query.volunteerView === undefined) return;
    const next = resolveVolunteerView(route.query.volunteerView, reviews.value, campaign.value, directory?.value ?? true);

    if (route.query.volunteerView !== next) {
      void router.replace({ path: route.path, query: { ...route.query, volunteerView: next } });
    }
  }, { immediate: true });

  return computed<VolunteerView>({
    get: () => resolveVolunteerView(route.query.volunteerView, reviews.value, campaign.value, directory?.value ?? true),
    set: (value) => {
      const next = resolveVolunteerView(value, reviews.value, campaign.value, directory?.value ?? true);

      if (next === resolveVolunteerView(route.query.volunteerView, reviews.value, campaign.value, directory?.value ?? true)) return;
      void router.push({ path: route.path, query: { ...route.query, volunteerView: next } });
    },
  });
}

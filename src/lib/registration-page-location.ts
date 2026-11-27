import { safeGoogleMapsUrl } from '@/lib/location-links';
import { safePublicResourceUrl } from '@/lib/safe-url';
import type { Event, EventLocationType } from '@/types';

export type RegistrationPageLocationDraft = {
  location_type: EventLocationType;
  stored_location_type: EventLocationType | undefined;
  location_mode: 'venue' | 'maps';
  location_name: string;
  location_url: string;
  online_url: string;
};

export type RegistrationPageDetailsDraft = RegistrationPageLocationDraft & {
  name: string;
  description: string;
  event_date: string;
  end_date: string;
};

export function registrationPageDetailsPatch(draft: RegistrationPageDetailsDraft, saved: RegistrationPageDetailsDraft): Record<string, unknown> {
  return {
    ...(draft.name !== saved.name ? { name: draft.name.trim() } : {}),
    ...(draft.description !== saved.description ? { description: draft.description.trim() } : {}),
    ...(draft.event_date !== saved.event_date ? { event_date: draft.event_date ? new Date(draft.event_date).toISOString() : null } : {}),
    ...(draft.end_date !== saved.end_date ? { end_date: draft.end_date ? new Date(draft.end_date).toISOString() : null } : {}),
    ...registrationPageLocationPatch(draft, saved),
  };
}

export function registrationPageLocationDraft(event: Event): RegistrationPageLocationDraft {
  const mapUrl = safeGoogleMapsUrl(event.location?.url);
  const name = event.location?.label ?? event.location?.name ?? '';
  const onlinePlaceholder = !mapUrl && /^(online(?: event)?|virtual(?: event)?)$/i.test(name.trim());
  const legacyOnline = onlinePlaceholder;
  const locationType = legacyOnline && event.location_type !== 'hybrid'
    ? 'online'
    : event.location_type ?? 'in_person';

  return {
    location_type: locationType,
    stored_location_type: event.location_type,
    location_mode: mapUrl ? 'maps' : 'venue',
    location_name: mapUrl || (locationType === 'online' && onlinePlaceholder) ? '' : name,
    location_url: mapUrl ?? '',
    online_url: event.online_url ?? '',
  };
}

export function registrationPageLocationValid(draft: RegistrationPageLocationDraft): boolean {
  const venueValid = draft.location_type === 'online' || Boolean(
    draft.location_mode === 'maps' ? safeGoogleMapsUrl(draft.location_url) : draft.location_name.trim(),
  );
  const onlineValid = draft.location_type === 'in_person' || !draft.online_url.trim() || Boolean(safePublicResourceUrl(draft.online_url));

  return venueValid && onlineValid;
}

export function registrationPageLocationPatch(draft: RegistrationPageLocationDraft, saved: RegistrationPageLocationDraft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const typeChanged = draft.location_type !== saved.location_type;
  const venueChanged = draft.location_mode !== saved.location_mode
    || (draft.location_mode === 'maps'
      ? draft.location_url.trim() !== saved.location_url.trim()
      : draft.location_name.trim() !== saved.location_name.trim());
  const onlineChanged = draft.online_url.trim() !== saved.online_url.trim();

  if (typeChanged) {
    patch.location_type = draft.location_type;

    if (draft.location_type === 'online') {
      patch.location = { name: 'Online', label: 'Online', url: null };
      patch.venue_address = null;
    }

    if (draft.location_type === 'in_person') patch.online_url = null;
  }

  if (draft.location_type !== 'in_person' && onlineChanged) {
    patch.online_url = draft.online_url.trim() ? safePublicResourceUrl(draft.online_url) : null;
  }

  if (draft.location_type !== 'online' && venueChanged) {
    const mapUrl = draft.location_mode === 'maps' ? safeGoogleMapsUrl(draft.location_url) : null;
    const name = mapUrl ? 'Google Maps location' : draft.location_name.trim();

    patch.location = { name, label: name, url: mapUrl };
    patch.venue_address = null;
  }

  if (!typeChanged && Object.keys(patch).length && saved.stored_location_type !== saved.location_type) {
    patch.location_type = saved.location_type;
  }

  return patch;
}

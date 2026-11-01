-- Photos are private storage objects associated with a speaker identity, not a proposal.
alter table public.annual_conference_speaker_profiles
  add column programme_photo_path text;

-- Legacy proposals can have no biography. Preserve that fact while giving each
-- historical speaker the same email-keyed identity used by newer proposals.
alter table public.annual_conference_speaker_profiles
  drop constraint annual_conference_speaker_profiles_bio_check;
alter table public.annual_conference_speaker_profiles
  add constraint annual_conference_speaker_profiles_bio_check check (char_length(btrim(bio)) <= 4000);

insert into public.annual_conference_speaker_profiles (email, name, bio, created_at, updated_at)
select distinct on (lower(btrim(speaker_email)))
  speaker_email, speaker_name, coalesce(bio, ''), created_at, updated_at
from public.annual_conference_speaker_submissions
where speaker_profile_id is null
order by lower(btrim(speaker_email)), updated_at desc
on conflict (email_normalized) do nothing;

update public.annual_conference_speaker_submissions as submission
set speaker_profile_id = profile.id
from public.annual_conference_speaker_profiles as profile
where submission.speaker_profile_id is null
  and lower(btrim(submission.speaker_email)) = profile.email_normalized;

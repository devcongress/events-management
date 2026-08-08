# Notes: Archive material follow-up

## Confirmed current behavior

- `archive_backfill` links create a new Talk and intentionally allow empty abstract, bio, and slides URL fields.
- `selected_speaker_confirmation` links require only the resource URL and create a new Talk from the selected proposal.
- The current reminder endpoint records a counter but does not send email.
- Published Talks are publicly derived from the `published` status, so the follow-up must preserve that status while only updating content fields.

## Follow-up contract

- One link belongs to one event and one existing Talk.
- The link carries an explicit list of requested fields: `abstract`, `bio`, and/or `slides_url`.
- GET returns only the existing values and requested fields needed for the form.
- POST validates only requested fields, updates the existing Talk, then consumes the link. A failed consume triggers restoration of the original Talk fields.
- Owner-only issue/retry APIs send a new single-use link; raw tokens remain unpersisted.

## Implemented evidence

- `20260808150000_archive_materials_follow_up.sql` adds `talk_id`, `requested_fields`, shape validation, and an active-link lookup index to the private link table.
- Owner issuance persists pending delivery before Resend, records provider acceptance or failure, and audits successful sends.
- Completion keeps a published Talk published, updates only the selected fields, and consumes the link after the record update.

---

# Notes: Separate Calls for Speakers

## Confirmed current behaviour

- The public monthly form is `src/views/CfpView.vue`, posts to `/api/cfp`, and is strictly limited to upcoming monthly Events.
- It currently requires name, email, presentation type, title, topic, summary, and bio. The server stores proposals through the mock speaker-submission adapter.
- Selected monthly proposals already have secure private completion links; archive-material follow-up can request bio, summary, and/or slides without creating a duplicate Talk.
- The Annual Conference has speaker-planning tasks but no public CFP form, campaign, proposal store, or review inbox.
- Public pages ultimately belong to `devcongress.org`; EMS owns private organizer operations and write APIs.

## Proposed shape

- Add a relational speaker-call campaign and proposal store, with an exclusive Event-or-edition parent constraint and indexed parent/status reads.
- Add canonical short routes for monthly and conference calls while retaining `/cfp/:eventId` as a compatible monthly alias.
- Add campaign-scoped Turnstile, public rate limits, duplicate resistance, organizer authorization, audit events, and RLS/service-role-only persistence.
- Reuse the selected-speaker and materials follow-up workflows after acceptance.

## Material architecture boundary

- `speaker_submissions`, `speaker_intake_links`, and `Talk` are all event-bound through `event_id`.
- Annual Conference editions are currently independent of `community_events`.
- Recommended model: add a private, one-to-one `conference_event_id` relationship from each edition to an internal Event with `series_type = special` and `format = conference`. The Annual Conference Speakers UI remains edition-scoped, but it uses that event only as durable programme identity.
- Alternative: a separate conference proposal/selection/archive schema. This would duplicate the existing lifecycle and create a second implementation to maintain.

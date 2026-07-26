# Notes: DevCongress Year-Round Operations

## Product Boundary

- `events-management` owns private operations, workflows, access, durable data, moderation, and the read-only public API.
- `devcongress.org` owns the public website, public discovery, and the future external-event submission form.
- The public API is extended compatibly rather than replaced.

## Annual Conference Input

The December conference plan currently includes:

- event date, theme, venue, capacity, and breakout rooms;
- keynote candidates;
- speaker call, review process, and submission form;
- volunteer call and submission form;
- workshops, panels, demos, and the programme outline;
- website, registration, and possible ticketing;
- sponsorship packages, sponsors, and partners;
- catering, photography, video/livestream, AV, and connectivity;
- badges, lanyards, swag, signage, flyers, backdrop, and stage branding;
- feedback survey and QR distribution;
- budget and expense tracking.

## Current Application Evidence

- A December volunteer form and organizer review surface exist.
- The public route is `/volunteer/december-mega-meetup`.
- The form submits to `POST /api/volunteer-applications`.
- Stored applications use the `december-mega-meetup` campaign ID and the organizer list reads that same campaign.
- The current volunteer form collects name, email, X handle, and Slack name.
- Availability, preferred role, and experience are not collected yet.
- Monthly CFP supports name, email, title, topic, abstract, bio, and optional GitHub username.
- The current CFP is deliberately restricted to upcoming monthly meetups, so the annual conference needs its own programme workflow rather than silently reusing that restriction.
- Program-outline editing and feedback QR display already provide reusable foundations.
- There is no conference budget or expense workflow yet.

## Planning Principle

Do not mark a conference workstream complete because a related meetup feature exists. Use:

- **Foundation available** when the app has reusable capability;
- **In progress** when work has begun for the annual edition;
- **Done** only when the December 2026 requirement is actually complete.

## Application Structure

- Keep monthly, quarterly, and special event operations in the existing Events area.
- Add the annual conference as a first-class workspace inside the same organizer console, not as a separate app and not as an oversized generic event page.
- Select the active annual edition, such as December 2026, before entering its operational modules.
- Reuse people, access, audit, files, and public API foundations across all event types.
- Scope conference work, programme, volunteers, finance, sponsors, and permissions to the annual edition.
- Release the annual workspace incrementally so normal meetup operations continue while conference capabilities are added.

## Volunteer Continuity Rule

- Preserve the existing public route as a permanent compatibility route for the December 2026 campaign.
- If a new 2026 URL is introduced, both URLs must resolve to the same campaign and feed the same volunteer table.
- Preserve existing application IDs, identity data, and timestamps when moving from the shared JSON document to relational Supabase tables.
- Keep the current organizer volunteer route as a redirect or alias when the list moves under Annual Conference → December 2026 → Volunteers.
- Give future annual editions their own campaign IDs and links; do not silently repoint the 2026 link to a later year.

## First Annual Workspace Slice

- The organizer primary navigation now points to `/organizer-console/annual-conference/2026`.
- Volunteers is nested at `/organizer-console/annual-conference/2026/volunteers`.
- The QR display is nested at `/organizer-console/annual-conference/2026/volunteers/display`.
- `/organizer-console/volunteers` and `/organizer-console/volunteer-display` remain compatibility redirects.
- The public path, API endpoints, `december-mega-meetup` campaign ID, and application storage were not changed.
- No Supabase migration is required for this route/workspace slice.

## Event Feedback Quality

- Event feedback is anonymous at the application-data layer: no name, email, page path, or user agent is collected for attendee event responses.
- The random event/browser response token remains a soft duplicate guard and is hashed before persistence; it is not an identity.
- Session answers use either a numeric rating from 1 through 5 or the `not_attended` sentinel.
- `not_attended` is counted separately and excluded from every event and monthly rating average.
- The existing structured JSON answer field accepts this sentinel, while required Supabase tester-name storage can continue using the generic `Anonymous attendee` placeholder.
- No Supabase migration is required for this feedback change.

# Task Plan: DevCongress Year-Round Operations

## Goal

Evolve Events Management into the durable operational backbone for DevCongress meetups, the annual December conference, event-scoped people and work, public website data, and moderated external event listings.

## Phases

- [x] Record the product boundary and domain decisions.
- [x] Capture the December conference workstreams in a living plan.
- [x] Define how the annual conference workspace coexists with regular event operations.
- [x] Protect the existing December 2026 volunteer link and application-table continuity as a migration requirement.
- [x] Establish the first Annual Conference workspace and nest the working volunteer surface under December 2026 without moving data.
- [x] Make event feedback anonymous and add an explicit non-attendance answer that stays out of rating averages.
- [ ] Assign an organizer owner, target date, and status to each 2026 conference workstream.
- [ ] Extend the event and people model without breaking the current public API.
- [ ] Integrate and validate the extended API in `devcongress.org`.
- [ ] Build relational annual-conference foundations for volunteers, workstreams, tasks, and expenses.
- [ ] Add the public external-event submission and organizer moderation workflow.
- [ ] Add annual-conference ticketing, sponsors, logistics, and communications incrementally.

## Immediate Organizer Work

1. Confirm the December 2026 date, theme, venue, capacity, and keynote shortlist.
2. Assign one accountable organizer to every row in the annual conference plan.
3. Add realistic target dates and dependencies.
4. Agree which workstreams need application support first:
   - workstreams and task assignments;
   - volunteer lifecycle;
   - annual speaker programme;
   - budget and expenses.

## Decisions Made

- `events-management` is the operational source of truth; `devcongress.org` is the public surface.
- The December event is an annual conference series with a yearly edition.
- The annual conference is a first-class workspace inside the existing organizer console; it is not a separate application or a bloated regular-event page.
- The existing December volunteer URL remains valid for the 2026 campaign; any replacement URL writes to the same campaign and organizer table.
- Event ownership, series, format, source, moderation, and publication are independent dimensions.
- People may hold multiple event-scoped roles without receiving global organizer access.
- The existing public meetup API will be extended additively.
- Public website integration happens before public external-event submissions.
- Durable multi-user operations move to relational Supabase storage.
- Expenses are part of annual conference operations, but their approval and access rules still need design.

## Errors Encountered

- The previous root planning files described the superseded prototype/community-hub phase. They have been refreshed to match the current year-round operations direction.

## Status

**Feedback quality slice delivered** — event feedback no longer collects attendee identity or browser/page context, session questions offer a required rating-or-non-attendance choice, and missed sessions are reported separately from 1–5 averages. The anonymous browser-level duplicate guard, annual-conference workspace, and volunteer-link continuity remain intact. No Supabase migration is required for this slice.

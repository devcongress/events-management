# Organizer Guide

This guide covers the organizer console workflows used to prepare and run DevCongress meetups.

## Log In

Open the organizer console and sign in with the prototype organizer password:

```text
/organizer-console/login
```

The base path can be changed with `VITE_ADMIN_BASE_PATH`.

## Manage Events

Use the event list to create, edit, publish, and remove meetups. If a Luma import comes in with the wrong event shell, remove it from the organizer list and import the corrected public URL again.

Event outlines are optional. When a meetup has a known run of show, add time/title/type/lead rows on the event overview; otherwise leave the outline empty and continue with the event checklist, talks, attendance, and feedback flows. Organizers can paste a plain text program outline and let the editor split it into rows before saving or publishing.

Use the `System design` outline type for the monthly architecture scenario. The System Design tab reads from those outline rows and lets organizers keep the public prompt link and recap notes updated after the event.

## Follow the Event Checklist

Each event overview includes a chronological checklist. The checklist is the primary shared source of truth for event preparation and can advance event status when milestones are completed.

Before an event is published publicly, organizers can disable incomplete checklist milestones that do not apply to that event. Disabled milestones stay visible, cannot be checked off, and do not count toward checklist progress.

## Review Talks

The Talks section is the review pipeline for CFP submissions and the backfill workspace for talks that happened before this app was live. The default backfill path is an expiring one-time speaker archive form link for a speaker to fill. Turn the speaker form off when an organizer needs to enter a confirmed or past talk directly. Organizers can then accept/reject CFP submissions, publish archive entries, and follow up for public slide links. Speaker links are tied to the event month and close after one successful submission.

## Manage Speakers

The Speakers section keeps the invite/access list aligned with the program. Adding a manual talk also keeps that speaker email available for speaker access.

## Review Attendance

The Attendance section accepts a Luma guest CSV export for the event. After import, organizers can review:

- Approved registrations
- Recorded check-ins
- Approved no-shows
- Check-in rate
- Registered people who did not check in

The global Attendance Hub gives a month-by-month ledger for venue planning.

## Collect Feedback

The Feedback section lets organizers prepare event-scoped feedback forms, choose required questions, preview the public form, and review responses.

The Feedback Hub also includes route-level app feedback from testers.

## Prepare Quiz Sessions

The Quiz section supports building questions and hosting a live quiz. Quiz is currently a preview/phase-two area and still uses polling rather than a production realtime channel.

## Prepare System Design Sessions

The System Design tab is the monthly scenario workspace. Add the scenario as a `System design` row in the event overview's program outline, then use the tab to publish the prompt link and short recap notes. Public meetup schedules link that row into the archive entry for the same meetup, where attendees can read the recap and open the prompt deck.

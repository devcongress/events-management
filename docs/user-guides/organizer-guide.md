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

## Follow the Event Checklist

Each event overview includes a chronological checklist. The checklist is the primary shared source of truth for event preparation and can advance event status when milestones are completed.

## Review Talks

The Talks section is the review pipeline for CFP submissions. Organizers can accept, reject, publish, and follow up for slides.

## Manage Speakers

The Speakers section keeps the invite/access list aligned with the program.

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

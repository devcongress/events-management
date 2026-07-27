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

## Plan the Annual Conference

Use **Annual Conference** in the primary navigation for the active December edition. The December 2026 overview establishes the conference workspace separately from regular monthly, quarterly, and special events.

The Overview keeps the provisional date and delivery progress visible without showing every planning note at once. Use **Edition details** to reveal the current venue and keynote notes, **Open work plan** for delivery ownership, or **Open volunteers** for the live intake form.

Open **Work plan** to see overall status and all eight workstreams before using the compact task ledger. Select a status or workstream to filter, search by task or owner, and open a row only when you need its notes, collaborators, or edit form; creating, viewing, and editing all use the same right-side drawer without resizing the ledger. Choose the one accountable owner from the active-organizer dropdown, then use the Collaborators multi-select for everyone else; names include email addresses so similarly named people remain distinguishable, and the accountable owner cannot also be selected as a collaborator. Choose target dates from the app calendar beside Priority; dates are displayed day-first. Tasks use exactly Not started, In progress, Blocked, or Done. Every organizer can edit tasks. Only Angela (`angelateyvi@gmail.com`) can add a new task.

Volunteer operations now live at **Annual Conference → December 2026 → Volunteers**. From there organizers can copy the existing public sign-up link, open the volunteer form, show its QR display, and review applications. Existing public QR codes and the `/volunteer/december-mega-meetup` link remain valid.

The Overview treats 19 December 2026 as provisional and summarizes live work-plan progress. Finance is not part of this first release; it remains a later restricted module.

## Follow the Event Checklist

Each event overview includes a chronological checklist. The checklist is the primary shared source of truth for event preparation and can advance event status when milestones are completed.

Quarterly meetup checklists are intentionally short: create the event shell, then update it with the G-Meet link from Edem.

Before an event is published publicly, organizers can disable incomplete checklist milestones that do not apply to that event. Disabled milestones stay visible, cannot be checked off, and do not count toward checklist progress. The monthly `Prepare system design session` milestone remains configurable after publication: choose `Not this month` when that meetup has no scenario, or `Include this month` to restore it.

## Review Talks

The Talks section is split into a workflow: CFP, Proposals, Program, and Legacy Backfill. Use CFP to open or close the public proposal form and copy the share link for upcoming monthly meetups only. Use Proposals to review public CFP submissions, select or reject speakers, then copy selected-speaker slides links from the shared link shelf once speakers are selected. Use Program to manage confirmed talks, slides, reminders, and publishing. Legacy Backfill is temporary cleanup for confirmed or past talks that did not go through the CFP flow; it generates speaker archive links and keeps newly generated links available to copy/open until organizers remove them. Speaker links are tied to the event month and close after one successful submission.

## Manage Speakers

The Speakers section keeps the invite/access list aligned with the program. Adding a manual talk also keeps that speaker email available for speaker access.

## Review Attendance

The Attendance section accepts a Luma guest CSV export for the event. After import, organizers can review:

- Approved registrations
- Recorded check-ins
- Approved no-shows
- Check-in rate
- Registered people who did not check in

The global Attendance Hub gives a month-by-month ledger for venue planning. Each imported event shows how many people came out of the total registrations, followed by the percentage calculated from that same total. The adjacent Attendance patterns panel offers three selected-year views from uploaded CSVs: recent approved RSVPs versus check-ins, the distribution of repeat RSVP follow-through, and the share of approved RSVPs who came or missed. For people with repeat approved RSVPs, the trail at the bottom reads oldest to newest: pink checks mean they came, while yellow crosses mean they registered but did not check in.

## Collect Feedback

The Feedback section lets organizers prepare event-scoped feedback forms, choose required questions, preview the public form, and review anonymous responses. The attendee form does not ask for a name or email.

Generated session questions require the attendee to choose either a rating from 1–5 or **Did not attend this session**. Missed sessions are counted separately in organizer reports and never reduce the session or speaker rating.

The Feedback Hub opens directly to event feedback reports, grouped by year and event period.

## Prepare Quiz Sessions

The Quiz section supports building questions and hosting a live quiz. Quiz is currently a preview/phase-two area and still uses polling rather than a production realtime channel.

## Prepare System Design Sessions

The System Design tab is the monthly scenario workspace. Add the scenario as a `System design` row in the event overview's program outline, then use the tab to publish the prompt link and short recap notes. If a month has no system design session, choose `Not this month` on the event checklist; the System Design tab becomes unavailable for that event until `Include this month` is selected. Public meetup schedules link saved system design rows into the archive entry for the same meetup, where attendees can read the recap and open the prompt deck.

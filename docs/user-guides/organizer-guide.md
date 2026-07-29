# Organizer Guide

This guide covers the organizer console workflows used to prepare and run DevCongress meetups.

## Log In

Open the organizer console and continue with Google using an approved organizer account:

```text
/organizer-console/login
```

The base path can be changed with `VITE_ADMIN_BASE_PATH`.

## Manage Events

Use the event list to create, classify, edit, publish, and remove meetups. Native creation is the only path: the event record and its internal registration campaign are created together.

Open the event’s **Registration** tab and use its four focused areas: **Summary** for going/capacity/places-left context and post-event no-shows, **Guests** for status/letter/name/email filtering plus check-in and cancellation, **Form & Capacity** for campaign status/window/capacity and the public link, and **Emails** for transactional delivery state and failed retries. Change the campaign to **Open** before the console exposes the public-link actions. Guests receive a place immediately until capacity is reached; overflow joins the waitlist automatically, with no pending approval or monthly auto-confirm setting. Cancelling a confirmed guest automatically gives the open place to the oldest waitlisted guest and queues their promotion notice; cancelling someone already waitlisted does not promote another guest. Tablet and laptop organizers use the full workspace. Phone organizers select **Mobile Ops → Check in guests** on the relevant event card; this opens a dedicated check-in screen, and **Back to events** returns to the event list. Phones do not expose campaign editing, cancellation, or test-record deletion. Older events without a native campaign state plainly that registration was not managed in this app and do not show a fictional guest list; use Attendance for any historical CSV import. Guests do not need a QR code or confirmation code. Registration exports, broadcasts, and bulk messaging are not provided.

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

## Build the Event Archive

**Event Archive** is the organizer's collection of lasting event items. Each item is either a **Talk** or **Product demo**. Older records that do not show a kind are treated as Talks.

For July, use **Archive Requests** when a known participant did not enter through proposals: select their topic/speaker row from the saved program, enter their email in the field that appears, choose the expiry, then send the request. You can select and email several speakers in one action. The supplied address is used only for this one-off request and is not added to the program outline or speaker allowlist. A successfully sent row is disabled to prevent accidental repeat sends. The link is locked to that person, topic, event, and item kind; it closes after one successful submission, and the completed item lands in Event Archive for organizer review. It is not public until an organizer explicitly publishes it.

For later meetups, use CFP to open or close the public proposal form and Proposals to select or reject submissions. A selected proposal receives its own private completion link. When the participant submits it, the result enters the same Event Archive model as the July manual path; it is not a second archive or a different record type.

## Manage Speakers

The Speakers section is an event-scoped identity and access allowlist. It is separate from Event Archive: adding someone to the allowlist does not create or publish an archive item, and an archive item remains content even if access rules later change. Archive creation may keep a matching speaker email on the allowlist for compatibility, but organizers should use Event Archive—not Speakers—to review and publish talks or product demos.

## Review Historical Attendance

The legacy Attendance section accepts historical Luma guest CSV exports. New native events use the Registration tab for the live guest list and check-ins. After a historical CSV import, organizers can review:

- Approved registrations
- Recorded check-ins
- Approved no-shows
- Check-in rate
- Registered people who did not check in

The global Attendance Hub gives a month-by-month ledger for venue planning. Each imported event shows how many people came out of the total registrations, followed by the percentage calculated from that same total. The adjacent Attendance patterns panel offers two selected-year views from uploaded CSVs: recent approved RSVPs versus check-ins, and the share of approved RSVPs who came or missed. The people table defaults to regular attendees with at least two check-ins, showing their registration count, check-ins, attendance rate, and last check-in. Switch to **Never came** to find everyone with at least two approved RSVPs and no recorded check-in, together with their missed count and latest RSVP.

## Collect Feedback

The Feedback section lets organizers prepare event-scoped feedback forms, choose required questions, preview the public form, and review anonymous responses. The attendee form does not ask for a name or email.

Generated session questions require the attendee to choose either a rating from 1–5 or **Did not attend this session**. Missed sessions are counted separately in organizer reports and never reduce the session or speaker rating.

The Feedback Hub opens directly to event feedback reports, grouped by year and event period.

## Prepare Quiz Sessions

The Quiz section supports building questions and hosting a live quiz. Quiz is currently a preview/phase-two area and still uses polling rather than a production realtime channel.

## Prepare System Design Sessions

The System Design tab is the monthly scenario workspace. Add the scenario as a `System design` row in the event overview's program outline, then use the tab to publish the prompt link and short recap notes. If a month has no system design session, choose `Not this month` on the event checklist; the System Design tab becomes unavailable for that event until `Include this month` is selected. Public meetup schedules link saved system design rows into the archive entry for the same meetup, where attendees can read the recap and open the prompt deck.

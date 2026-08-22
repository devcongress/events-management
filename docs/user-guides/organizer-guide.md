# Organizer Guide

This guide covers the organizer console workflows used to prepare and run DevCongress meetups.

## Log In

Open the organizer console and continue with Google using an approved organizer account:

```text
/organizer-console/login
```

The base path can be changed with `VITE_ADMIN_BASE_PATH`.

## Inspect Recipient Emails

Owners can open **Audit Log** from the primary navigation on a tablet or desktop, then choose **Email previews** beside **Email delivery**. Choose any live scenario to see who receives it, when it is triggered, its sender and subject, and the exact HTML produced by the current delivery template. Use **Plain text** to inspect the fallback inbox content and **Desktop / Mobile** to change the email preview width. The subsection uses sample names, addresses, events, and links; it never reads a real recipient record and never sends an email.

The collapsed **Not active yet** section lists planned Annual Conference email scenarios separately. They do not have previews because EMS does not send them today.

## Manage Events

Use the event list to create, classify, edit, publish, and remove meetups. Native creation is the only path: the event record and its internal registration campaign are created together.

When a Community event's registration-page monitor reports changed details or a persistent page problem, open that event's **Review actions**. **Message organizer** opens a prefilled email containing the detected differences, **Edit listing** updates the DevCongress copy only after verification, and **Temporarily unpublish** removes the listing from the public calendar behind a confirmation without cancelling the organizer's event. Approving a submitted amendment clears the reviewed differences and waits for the monitor's next scheduled check; it does not immediately check or alert again. **Check now** and **Open source page** remain available when an earlier verification is useful.

Use the local Events workspace switcher to move between **All events** and **Community submissions**. Community submissions are proposals from external organizers; **Approve & publish** promotes and publishes the proposal as a canonical external event and automatically queues the approval email. Rejection keeps it out of the public event collection: choose a reason category, add an optional message that will be emailed, keep any private context in the separate internal note, then use **Reject & notify organizer**. The table opens on **Pending**, whose circular counter shows the number still awaiting review; switch to Approved or Rejected when historical decisions are needed. Select a proposal row to review its complete details, stored rejection fields, and receipt/decision email state in the right-side drawer. Failed emails can be retried there without repeating the moderation decision. **Accepted** means the provider accepted the email; it does not claim inbox delivery.

Select **Preview Website Events** from Events to see the same published collection another service receives from `/api/public/meetups`. Open any card to preview that event’s public detail, use **View JSON** when you need to inspect the exact response, and use **Back to Events** to return. The preview intentionally excludes unpublished drafts because it reads the public consumer contract rather than the private organizer event list.

Open the event’s **Registration** tab and use its four focused areas: **Summary** for going/capacity/places-left context and post-event no-shows, **Guests** for status/letter/name/email filtering plus check-in and cancellation, **Form & Capacity** for campaign status/window/capacity and the public link, and **Emails** for transactional delivery state and failed retries. Change the campaign to **Open** before the console exposes the public-link actions. Guests receive a place immediately until capacity is reached; overflow joins the waitlist automatically, with no pending approval or monthly auto-confirm setting. Cancelling a confirmed guest automatically gives the open place to the oldest waitlisted guest and queues their promotion notice; cancelling someone already waitlisted does not promote another guest. Tablet and laptop organizers use the full workspace. On a phone, open **Events**, choose **Manage event**, then use **Guests** to search the live internal list, check guests in, or safely undo a mistaken check-in. **Check-in mode** remains available when a focused event-day list is preferable. Phones do not expose campaign editing, guest cancellation, or test-record deletion. Older events without a native campaign state plainly that registration was not managed in this app and do not show a fictional guest list; use Attendance for any historical CSV import. Guests do not need a QR code or confirmation code. Registration exports, broadcasts, and bulk messaging are not provided.

Event outlines are optional. When a meetup has a known run of show, add time/title/type/lead rows on the event overview; otherwise leave the outline empty and continue with the event checklist, talks, attendance, and feedback flows. Organizers can paste a plain text program outline and let the editor split it into rows before saving or publishing.

Use the `System design` outline type for the monthly architecture scenario. The System Design tab reads from those outline rows and lets organizers keep the public prompt link and recap notes updated after the event.

## Plan the Annual Conference

Use **Annual Conference** in the primary navigation and select the required edition from the edition switcher. The December 2026 overview remains separate from regular monthly, quarterly, and special events. The current planning owner can create the next edition and either select an active organizer as its planning owner or inherit the previous edition's owner.

On a phone, use the menu to move between **Home**, **Events**, and **Conference**. Home provides orientation only. Events contains the event list and a dedicated three-part workspace for each event: **Overview** for context and quick links, **Guests** for the live registration list and check-in actions, and **Submissions** for full speaker and product-demo proposals plus select/not-select decisions. From Overview, **Email guests** opens a focused Blasts workspace with the confirmed audience, capacity protection, Reminder/Event update/Venue change starters, optional scheduling, mandatory rendered preview, delivery history, and safe failed-send retry. Advanced event setup, bulk audience selection, guest cancellation, and destructive administration remain desktop-only. Conference opens the dedicated Annual Conference workspace. Organizers receive mobile versions of **Overview**, the searchable and filterable **Work plan**, **Timeline** with phase management and planning gaps, and the 2026 **Volunteers** area. Organizers with the corresponding permissions can switch or create editions, create and fully edit tasks, and create, edit, reorder, or delete phases. Task and edition forms use full-screen phone flows rather than compressed desktop tables. Volunteers receive **Overview** and **My tasks** by default, showing only assigned work, hiding internal organizer notes, and allowing status updates only. Explicit responsibilities add the matching conference-wide data and mobile tabs.

The Overview keeps the provisional date and delivery progress visible without showing every planning note at once. Use **Edition details** to reveal the current venue and keynote notes, **Open work plan** for delivery ownership, or **Open volunteers** for the live intake form.

Open **Work plan** to see overall status and all eight workstreams before using the compact task ledger. Filter by phase—including **No phase**—status, workstream, or owner, and open a row for its details or editor. Choose a phase and target date in the task drawer; dates remain optional but are called out on the Timeline, and an assigned target date cannot exceed the phase end. The platform owner and edition planning owner can add and edit every task; other organizers can edit tasks where they are accountable or collaborating. A read-only task explains the applicable permission instead of presenting an empty action area.

Owner and collaborator selectors show organizer names rather than email addresses. Emails remain the stable stored identity, so changing the presentation does not change task ownership.

Open **Timeline** for the conference-health dashboard. Its unified top summary shows overall completion and the conference countdown, followed by current phase, planning confidence, overdue, blocked, and due-soon facts without repeating them in separate cards. **Threats to delivery** and **What is coming up?** show no more than two real tasks each; empty panels stay empty rather than showing sample tasks. The page checks the shared plan every 30 seconds and whenever you return to its window, so another organizer's status or date changes automatically update which tasks appear. The conference countdown and other day-sensitive signals refresh automatically using Accra time, including when the page remains open across midnight. **Needs planning** appears while tasks still lack phases or target dates, because the schedule cannot yet support a trustworthy on-track forecast. Use the bounded **Planning gaps** board to clear missing planning data: each task appears once under **Tasks missing a phase and target date**, **Dated tasks missing a phase**, or **Phased tasks missing a target date**. Filter all three lanes by status, scroll each lane independently, and use its pagination controls to move through six cards at a time. Cards show status, workstream, owner, collaborators, phase, target date, and any dependency before you open them. Select any card to open its editor directly; once both fields are present, the task leaves the board and remains in the Work Plan. The planning owner can manage phase names, dates, order, and deletion from the separate phase manager.

Volunteer operations live at **Annual Conference → December 2026 → Volunteers**. Access is divided into **View the volunteer team**, **Share the volunteer form**, and **Review volunteer applications**. The public form is positioned as a general invitation to volunteer with DevCongress: name and email are required, while X and DevCongress Slack names are optional. **Copy link** and **Show QR** prefer the owned `go.devcongress.org` short link for the canonical `/volunteer` form. Only application review reveals names, email addresses, available social details, and sign-up times. Existing `/volunteer/december-mega-meetup` links and QR codes redirect to the canonical form and continue feeding this directory.

Owners delegate access from **People & Access → Delegation**. Choose an active Volunteer, open delegation, select the conference edition, and enable the required Work Plan, Timeline, phase, or Volunteers responsibilities. Volunteers begin with assigned tasks only; Organizers and Owners are not delegation targets because their access comes from their role. Additional grants apply only to the selected edition, and disabling the Volunteer or changing their role clears those grants.

The Annual Conference **Volunteers** workspace uses one directory for both sign-ups and active team members. Each person appears once with an **Active** or **Applicant** status. Active Volunteers who did not use the public form are included with unavailable application fields shown as dashes; applicant email and social details remain visible only to members with the application-review responsibility.

After disabling a member, an Owner can either **Re-enable** the same membership or choose **Remove** and confirm permanent removal from People & Access. Permanent removal deletes the allowlist membership, app sessions, and delegated conference access while retaining historical audit records and task attribution. Disable is required before permanent removal.

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

The Quiz section is a separate ice-breaker flow and remains a preview/phase-two area. It is not used for the System Design learning-room workflow.

## Prepare System Design Learning Rooms

Use the learning-question panel directly on the saved System Design workspace. Generate and review five questions with concise reveal explanations, then choose **Open presentation view** to open a standalone shared screen in a new browser tab. The organizer workspace remains open in the original tab; the presenter has no admin navigation or editing links. Its QR-first lobby waits for attendees before the facilitator starts. Every attendee receives a default name and fixed Navii avatar after scanning, and may edit the name from their own phone while the lobby remains open; there is no organizer naming setting. Starting the first question closes identity editing. The facilitator then releases and reveals one question at a time, and the room pulse shows a scalable bar for each answer with its participant count and percentage. Finishing the room shows the final presenter leaderboard; attendee phones show only their own avatar, name, and position, with confetti reserved for the top five. This remains available for previous meetups with saved System Design links: meetup completion does not disable the artifact, questions, or presenter. Opening a completed room prepares a fresh live run while preserving the reviewed question set.

## Prepare System Design Sessions

The System Design tab is the monthly scenario workspace. Add the scenario as a `System design` row in the event overview's program outline, then use the tab to publish the prompt link and short recap notes. If a month has no system design session, choose `Not this month` on the event checklist; the tab stays unavailable until `Include this month` is selected or a saved System Design source already exists. Public meetup schedules link saved system design rows into the archive entry for the same meetup, where attendees can read the recap and open the prompt deck.

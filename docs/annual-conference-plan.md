# DevCongress Annual Conference Plan

**Active edition:** December 2026

**Plan status:** Active planning; Overview and Work plan available

**Last updated:** 2026-08-03

**Maintainers:** DevCongress organizers; Angela (`angelateyvi@gmail.com`) manages new task creation

This is the living operational plan for the annual December conference. Update it as decisions are made, work starts, ownership changes, or application support is added.

The durable product and domain rules remain in the [Product Operating Model](product-operating-model.md).

## How To Maintain This Plan

Use these statuses consistently:

| Status      | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| Not started | Agreed work that has not begun                                   |
| In progress | Someone is actively delivering the annual-conference requirement |
| Blocked     | Work cannot proceed until the named dependency is resolved       |
| Done        | The December 2026 requirement is complete and verified           |

For every row:

- assign one accountable owner;
- list everyone else involved as collaborators;
- add a realistic target date;
- link every prerequisite task through **Depends on** rather than describing it in free text; use the Overview dependency pulse to see the current blockers and ready work;
- link supporting documents when they exist;
- mark work `Done` only for the active annual edition.

## Application Structure

The annual conference should be a first-class workspace inside the existing organizer console. Regular monthly, quarterly, and special event operations continue in the Events area while the annual workspace develops independently.

```text
Organizer Console
├── Events
│   ├── Monthly meetups
│   ├── Quarterly meetups
│   └── Special DevCongress events
├── Annual Conference
│   └── December 2026
│       ├── Overview
│       ├── Work plan
│       ├── Programme
│       ├── Volunteers
│       ├── Registration
│       ├── Sponsors
│       ├── Logistics and production
│       ├── Marketing and media
│       ├── Budget and expenses
│       ├── Feedback and reports
│       └── Settings and access
├── People and access
└── External event submissions (later)
```

### Current application checkpoint

The first operational workspace slice is now in place:

- the primary organizer navigation exposes **Annual Conference**, not a global Volunteer Hub;
- `/organizer-console/annual-conference/:year` is an edition-scoped overview, with 2026 as the initial edition;
- the provisional date is **19 December 2026**;
- Work plan is live at `/organizer-console/annual-conference/2026/work-plan`, seeded once from `DevCongress 2026 — Event Checklist.xlsx`;
- Volunteers is nested at `/organizer-console/annual-conference/2026/volunteers`;
- the Volunteers workspace keeps Directory, Reviews, and Campaign as connected desktop and phone tabs; application-review capability grants access to submitted motivation, Accra availability, review status/notes, and a simple invitation sent state, while deadline, preview, quota, batch, and delivery diagnostics remain Owner-only in Campaign;
- Overview, Work plan, and the 2026 Volunteers workflow are interactive today; former Timeline links redirect into Work plan, while future modules remain visible as planned structure rather than empty routes;
- the former organizer volunteer paths redirect to the new workspace;
- the existing public form, QR link, campaign ID, submission API, and stored applications are unchanged.
- each accountable owner or collaborator can edit their assigned tasks; the edition planning owner and platform owner can edit every task, add tasks, manage phases, and create the next edition;
- 2026 has fixed **Phase 1** (1–31 August) and **Phase 2** (1 September–19 December); 12 confirmed kickoff tasks are assigned to Phase 1 and the remaining 15 tasks stay in **No phase** until organizers classify them;
- future editions can define any number of non-overlapping phases, select a planning owner or inherit the previous edition's owner, and reorder, rename, redate, or delete phases without deleting tasks;
- task target dates remain nullable but are prioritized by the conference-health dashboard; an assigned task's target date cannot exceed its phase end date;
- task dependencies are explicit prerequisite-task links within one edition; the Work Plan blocks self-links and circular chains, and Overview summarizes links, waiting tasks, ready tasks, and the direct blocker paths;
- owners and organizers can add an authenticated user with the **Volunteer** role from People & Access;
- volunteer sessions land in Annual Conference, see only tasks where their email is accountable or collaborating, and can update those task statuses plus add and manage their own task-resource links; task details remain organizer-editable;
- task drawers include up to 20 optionally labeled HTTP/HTTPS resources, with creator attribution. Organizers who can edit a task can manage all its resources; volunteer access requires current assignment and never allows editing another contributor’s links;
- Details supports bold, italic, strikethrough and lists, with a 2,000-character text limit and bounded JSON structure. Legacy descriptions retain literal text and line breaks; Depends on sits beside Target date on desktop and stacks on phones;
- phone organizers receive mobile versions of Overview, Work Plan, Volunteers, edition controls, and task create/edit flows; phone volunteers receive a separate assignment-only Overview and My Tasks interface;
- volunteer access is enforced at both the organizer router and API boundary; Events, hubs, access management, applicant records, task creation, task reassignment, task-detail editing, and organizer-only internal notes remain unavailable;
- Work plan is phase-scoped by default: it opens on the current phase, or the next available phase outside an active window, and recalculates every metric and task section when organizers switch to another phase, **No phase**, or the entire conference; an intentional Entire conference scope is stored explicitly in the URL so optimistic status moves retain it. The Work plan header pairs actual completion with elapsed phase time and a date-only remaining-time label for selected phases, then replaces only its desktop task table with a status board for the same filtered tasks. Its owner filter uses a compact avatar group while preserving the URL-backed owner selection, and its cards stay compact with the workstream, priority, title, a two-line description, a stable visually distinct Navii avatar per accountable owner, the owner name, and optional target date while the task drawer holds full details. Eligible status moves render in their destination column immediately, remain draggable while saving, and queue each task’s latest requested status safely; saves for different tasks proceed independently, while a failed final save restores only that task’s last confirmed column. People with **Manage the work plan** can also remove a card after an explicit confirmation; deletion is audited, removes attached resources, and clears the task from other cards’ dependency lists. Owners can override each role-appropriate conference permission per edition, including turning a role-default permission off without changing the person’s global role;
- conference health keeps objective completion, elapsed phase time, overdue/blocked pressure, due-soon counts, and planning confidence visible at a glance; planning confidence measures task coverage across dates, phases, and accountable owners;
- the Overview replaces the Volunteer Intake callout with a compact workload view for Owners and Organizers: outstanding work is grouped once per canonical accountable-owner identity, and the same directory resolves organizer display names, email addresses, and unambiguous email local parts in the owner filter and ledger; selecting a person opens the entire Work plan with every matching task even when work spans phases, unresolved legacy names remain visible and filterable, direct Work plan visits still default to the current phase, and volunteer sessions do not receive the team-wide view;
- supported Annual Conference section, phase, status, workstream, owner, attention, and open-task context lives in the URL and survives desktop/phone redirects; overview delivery signals, dependency blockers, assignee summaries, and workstream summaries open the matching work-plan context; mobile tab and task navigation creates meaningful browser history, while malformed or unavailable context falls back to a safe overview or default filter;
- the first named spreadsheet owner is accountable and the remaining names are collaborators; `All`, `TBD`, and blank owners remain unassigned;
- new owner and collaborator selections use active organizer emails as stable identities, while the UI shows organizer names and preserves unchanged legacy spreadsheet assignments;
- finance is now a restricted GHS module with Owner-managed ledger entry and named Organizer read access; reminders are not part of this release.

The work plan uses relational `annual_conference_editions`, `annual_conference_phases`, and `annual_conference_tasks` Supabase tables in production, with a local JSON fallback for development. The initial plan contains the 26 imported checklist tasks plus the new Volunteer recruitment task: 25 Not started and 2 Done.

### Annual workspace modules

| Module                   | Responsibility                                | Initial scope                                                                                                                |
| ------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Overview                 | One operational picture of the active edition | Key decisions, milestones, owners, blockers, readiness, and cross-workstream status                                          |
| Work plan                | Replace the shared spreadsheet                | Workstreams, filters, tasks, owners, deadlines, dependencies, priority, status, activity history, and a desktop status board |
| Programme                | Build what happens on stage and in rooms      | CFP, reviews, keynotes, speakers, talks/workshops/panels/demos, rooms, technical needs, and run of show                      |
| Volunteers               | Move from interest to useful assignments      | Intake, review, roles, teams, shifts, assignments, briefing, and status                                                      |
| Registration             | Manage the attendee journey                   | Registration/ticketing, capacity, attendee communication, check-in, badges, cancellations, and refunds where applicable      |
| Sponsors                 | Manage relationships and fulfilment           | Prospects, packages, stages, contacts, commitments, payments, benefits, and deliverables                                     |
| Logistics and production | Prepare the physical and technical event      | Venue, rooms, catering, AV, connectivity, signage, swag, safety, setup, and day-of runbooks                                  |
| Marketing and media      | Coordinate public communication and content   | Website inputs, flyers, stage/backdrop, campaigns, photography, video, livestream, and publishing                            |
| Budget and expenses      | Control private conference finance            | Budget, approvals, commitments, expenses, receipts, reimbursements, sponsor income, and variance                             |
| Feedback and reports     | Learn from the edition                        | Survey, QR distribution, responses, conference report, retrospective, and reusable lessons                                   |
| Settings and access      | Protect and configure the edition             | Edition details, phases, workstream leads, scoped permissions, data visibility, and archive controls                         |

### Coexistence rules

- The annual workspace uses the same event, people, access, audit, storage, and public API foundations as the rest of the platform.
- Conference data is scoped to its annual edition so December 2026 work does not appear in monthly-event workflows.
- A person has one identity but may have different engagements across events: organizer, workstream lead, volunteer, speaker, attendee, or sponsor contact.
- Access is capability- and edition-scoped. A volunteer or speaker does not gain the full organizer console.
- The current 2026 access slice represents conference volunteers through a narrow membership role; assignment matching uses the active membership email, and later multi-edition access should replace that shortcut with explicit edition engagements.
- Regular event operations must remain usable while conference modules are incomplete or being deployed.
- Public conference data reaches `devcongress.org` only through the approved public API; private work, finance, applications, and internal notes stay in `events-management`.
- Existing meetup components may be reused, but their data and rules must not be silently shared with the annual workflow.
- The workspace ships incrementally; an empty navigation shell for every future module is not required on day one.

### Suggested delivery order

1. **Workspace foundation:** active annual edition, overview, workstreams, tasks, people engagements, scoped access, and audit.
2. **Immediate operations:** volunteers, annual programme/speakers, and budget/expenses.
3. **Conference expansion:** registration/ticketing, sponsors, logistics/production, and marketing/media.
4. **Live and closeout:** day-of operations, feedback, reporting, archive, and next-edition rollover.

### Volunteer link and data continuity

The current December 2026 volunteer form is already public and must survive the workspace reshuffle.

| Contract                | Requirement                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing public path    | Keep `/volunteer/december-mega-meetup` working for December 2026                                                                             |
| Canonical public path   | Use the evergreen `/volunteer` route and redirect the existing path to it                                                                    |
| Existing submission API | Keep `POST /api/volunteer-applications` compatible until a versioned replacement is available                                                |
| Existing campaign       | Treat `december-mega-meetup` as the legacy identifier for the December 2026 volunteer campaign                                               |
| Owned short link        | Keep one active opaque `go.devcongress.org` code for the evergreen form; both direct routes update the same legacy campaign list             |
| Existing submissions    | Migrate IDs, contact data, and creation timestamps; do not start the annual workspace with an empty list                                     |
| Organizer location      | Move the working view to Annual Conference → December 2026 → Volunteers, while preserving the current organizer route as a redirect or alias |
| Existing QR codes       | Keep them valid through the compatibility redirect; new displays prefer the owned short link                                                 |
| Future editions         | Give December 2027 and later editions distinct campaign IDs and links; never silently reuse the 2026 campaign                                |

The intended result is one December 2026 volunteer dataset regardless of which valid 2026 link an applicant follows.

## Current Edition Decisions

| Decision                    | Status      | Owner      | Target      | Notes                                                                                                                                                                            |
| --------------------------- | ----------- | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact date or dates         | Done        | Unassigned | 19 Dec 2026 | 19 December 2026 is the provisional starting point; confirmation remains a later decision                                                                                        |
| Conference theme            | Not started | Unassigned | TBD         | Gates keynote outreach, CFP framing, programme, sponsorship deck, and creative                                                                                                   |
| Venue                       | Not started | Elijah     | TBD         | UPSA and Accra Digital Centre are the current candidates; Elvis collaborates                                                                                                     |
| Attendance target           | Not started | Unassigned | TBD         | Needed for capacity, ticketing, catering, badges, swag, connectivity, and budget                                                                                                 |
| Keynote speaker or speakers | Not started | Elijah     | TBD         | Patrick G. Awuah is preferred; the original shortlist also mentioned the NSMQ quiz mistress                                                                                      |
| Ticketing approach          | In progress | Unassigned | TBD         | Paid registration is confirmed for December; choose the payment provider and define payment, refund, reconciliation, and failure ownership after the free monthly flow is proven |
| Overall conference budget   | In progress | Owner      | 2026-08-05  | Maintained in the private GHS Finance workspace with planned, committed, paid, remaining, and income totals                                                                      |

## Programme and Speakers

| Work item                       | Status      | Owner      | Target     | Current note / next action                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ----------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Put out the Call for Speakers   | Not started | Unassigned | TBD        | Define submission criteria, deadline, review committee, selection rubric, and response timeline                                                                                                                                                                                                                                                       |
| Annual speaker submission form  | Done        | Elvis      | 2026-09-07 | Separate conference CFP requires identity, reusable bio (150 words recommended), title, fixed track/type, 250-word abstract, and 3–5 learning outcomes; each submission is independently reviewed. Success is confirmed on-page with another-proposal action; no receipt email is sent so quota remains available for decisions and other operations. |
| Speaker review committee        | Not started | Unassigned | TBD        | Name reviewers, resolve conflicts, and define selection/communication responsibilities                                                                                                                                                                                                                                                                |
| Keynote outreach                | Blocked     | Unassigned | TBD        | Starts after date, theme, venue confidence, and shortlist confirmation                                                                                                                                                                                                                                                                                |
| Workshops and breakout sessions | Not started | Unassigned | TBD        | Assign facilitators, rooms, capacity, materials, equipment, and support volunteers                                                                                                                                                                                                                                                                    |
| Panel discussions               | Not started | Unassigned | TBD        | Define topics, moderator, panelists, duration, and audience-question format                                                                                                                                                                                                                                                                           |
| Demo sessions                   | Not started | Unassigned | TBD        | Confirm presenters, time slots, power, network, projection, and fallback needs                                                                                                                                                                                                                                                                        |
| Programme outline               | Not started | Angela     | TBD        | Build the December run of show after sessions and rooms are known                                                                                                                                                                                                                                                                                     |
| Speaker communications          | In progress | Unassigned | TBD        | Acceptance now automatically emails a proposal-scoped private logistics workspace; organizers control its edit deadline and can retry failed delivery. Rejection messaging, reminders, and day-of instructions remain                                                                                                                                 |

## Volunteers and Work Assignments

The 2026 volunteer follow-up is an edition-owned, Owner-launched campaign under Volunteers. The provisional application cutoff is **30 September 2026, 23:59 Africa/Accra**; the two-question response form closes exactly 14 days later, **14 October 2026, 23:59**. The Owner can change the application cutoff only while the campaign is draft; launching fixes it because invitation emails promise that date. The public intake continues to accrue applicants until that cutoff. Eligible applications are enrolled individually after intake, launch performs a full reconciliation before entering running state, and the 15-minute scheduler repairs draft, paused, and running queues independently of email configuration or quota. Enrollment failures do not reject an application; queue visibility can lag until the next scheduled recovery. Each recipient retains the source application timestamp, and the claim transaction rechecks it against the current cutoff so moving the draft deadline earlier cannot send invitations to later applicants. The follow-up read itself is side-effect free. The form asks for motivation (120 words maximum) and whether the person can come to Accra on 19 December without travel grants or sponsorship; it requires Turnstile and accepts one final submission. Applicants receive a private, recipient-bound link. Scheduled drains hold an expiring database lease, verify complete Resend quota observations before sending, and stop on ambiguous provider results or any failure after provider acceptance.

The Worker scheduler attempts up to 54 total invitation and outcome sends per Accra day, with a shared 35-email reserve for other transactional mail and a fresh provider quota observation required before sending. Provider events update delivery state; transient errors use 15/60/240-minute backoff within Resend's idempotency window. An ambiguous provider result beyond that window is marked for Owner inspection, not blindly resent. Deployment does not send anything: the Owner must review the deadline and template and explicitly launch invitations, then separately preview and confirm outcome batches. Authorized reviewers record `Pending`, `Accepted`, or `Not selected` alongside review status and notes; saving never sends mail. Only the Owner can preview/confirm batches, pause/resume outcome sending, or see quota/error diagnostics. Delivery conflicts require explicit Owner handling outside the automated workflow.

The Follow-up workspace summarizes invitation progress, separates delivery, response, and review states, and provides searchable, paginated recipient records. The Owner's campaign setup is shown above the inbox, while delivery health is collapsed until needed. Selecting an applicant opens contextual details beside the list on desktop and in a keyboard-contained side drawer on smaller screens. Campaign setup places **Preview volunteer form** beside the invitation **Preview** control. The invitation drawer shows the production email and its plain-text alternative; the form link opens the separate protected organizer test route in the same tab. Owners and Organizers can fill the deployed test form; test answers are validated and human-verified, then discarded without saving or sending.

| Work item                            | Status      | Owner      | Target | Current note / next action                                                                                                                                          |
| ------------------------------------ | ----------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Call for Volunteers                  | Not started | Elvis      | TBD    | Ernest collaborates; define the outreach window and target volunteer count                                                                                          |
| Volunteer submission form            | Done        | Elvis      | TBD    | The public form is live; Ernest collaborates. Review, assignment, briefing, and communications are separate later-stage tasks                                       |
| Volunteer roles and staffing plan    | Not started | Unassigned | TBD    | Define teams, role descriptions, shift windows, team leads, and headcount per area                                                                                  |
| Application review and selection     | Not started | Unassigned | TBD    | Organizer review lives under Annual Conference → December 2026 → Volunteers; add decisions, status, notes, and duplicate/person handling in the relational workflow |
| Workstreams and task assignment      | Not started | Unassigned | TBD    | Replace the December spreadsheet with workstreams, tasks, owners, deadlines, dependencies, and completion status                                                    |
| Volunteer communication and briefing | Not started | Unassigned | TBD    | Plan acceptance, team allocation, training, reminders, escalation contacts, and day-of check-in                                                                     |

## Website, Registration, and Attendee Journey

| Work item                     | Status      | Owner      | Target | Current note / next action                                                                                                                                                  |
| ----------------------------- | ----------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conference website/page       | Not started | Unassigned | TBD    | Public page on `devcongress.org` should cover the theme, venue, programme, speakers, sponsors, forms, and attendee actions                                                  |
| Registration or ticketing     | Not started | Unassigned | TBD    | Decide provider, capacity rules, ticket classes, confirmation, check-in, cancellation, payments, refunds, and attendee-data ownership                                       |
| Registration forms and embeds | In progress | Unassigned | TBD    | Extend the internal native registration foundation with paid checkout for December; keep event, attendee, payment, CFP, volunteer, sponsor, and feedback ownership explicit |
| Badges and lanyards           | Not started | Unassigned | TBD    | Define badge data, design, printing, pickup, walk-ins, reprints, and check-in-system integration                                                                            |
| Attendee communications       | Not started | Unassigned | TBD    | Plan confirmation, reminders, venue guidance, programme changes, and post-event follow-up                                                                                   |

## Sponsorships and Partners

| Work item                | Status      | Owner      | Target | Current note / next action                                                                                 |
| ------------------------ | ----------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Sponsorship packages     | Not started | Unassigned | TBD    | Define tiers, pricing, benefits, inventory, limits, deliverables, and the sponsor deck                     |
| Sponsor and partner call | Blocked     | Unassigned | TBD    | Launch after packages, theme, audience profile, budget need, and contact list are ready                    |
| Sponsorship pipeline     | Not started | Unassigned | TBD    | Track prospects, owner, stage, next action, contact history, commitment, invoice/payment, and deliverables |
| Sponsor fulfilment       | Not started | Unassigned | TBD    | Track logos, mentions, booths, speaking benefits, passes, branding placement, and post-event reporting     |

## Venue, Production, and Attendee Experience

| Work item              | Status      | Owner      | Target | Current note / next action                                                                                                                                                   |
| ---------------------- | ----------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venue and room plan    | Not started | Angela     | TBD    | UPSA and Accra Digital Centre are under consideration; confirm capacity, breakout rooms, accessibility, setup/teardown time, furniture, security, and emergency arrangements |
| Catering               | Not started | Unassigned | TBD    | Plan breakfast and lunch, headcount, dietary needs, serving schedule, water, vendor, and waste handling                                                                      |
| AV equipment           | Not started | Unassigned | TBD    | Inventory microphones, projectors, screens, adapters, presentation machines, audio, lighting, and breakout-room equipment                                                    |
| Wi-Fi and connectivity | Not started | Unassigned | TBD    | Validate high-density bandwidth, guest access, speaker/demo needs, livestream capacity, support, and backup connectivity                                                     |
| Signage and wayfinding | Not started | Unassigned | TBD    | Plan room labels, directional signs, programme boards, registration markers, sponsor signs, and accessibility cues                                                           |
| Swag and merchandise   | Not started | Unassigned | TBD    | Decide items, quantities, sizes, sponsor branding, sourcing, distribution, and leftovers                                                                                     |
| Day-of operations      | Not started | Unassigned | TBD    | Build setup, registration, room, speaker, volunteer, incident, and teardown runbooks                                                                                         |

## Creative, Marketing, and Brand

| Work item                       | Status      | Owner      | Target | Current note / next action                                                                             |
| ------------------------------- | ----------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------ |
| Flyer designs                   | Not started | Unassigned | TBD    | Produce digital and print variants plus sizes for social, web, email, partners, and venue display      |
| Backdrop and stage designs      | Not started | Unassigned | TBD    | Cover main stage, photo wall, lectern/screens, sponsor placement, and reusable branding elements       |
| Marketing plan                  | Not started | Unassigned | TBD    | Define audiences, announcement sequence, channels, content calendar, partners, owners, and measurement |
| Programme and speaker promotion | Not started | Unassigned | TBD    | Plan announcement assets, approvals, speaker kits, and schedule                                        |

## Photography, Video, and Livestream

| Work item                  | Status      | Owner      | Target | Current note / next action                                                                                             |
| -------------------------- | ----------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Photography                | Not started | Unassigned | TBD    | Book photographer, agree shot list, usage rights, delivery format, storage, and timeline                               |
| Videography and livestream | Not started | Unassigned | TBD    | Book team, choose platform, define recording setup, room coverage, captions, redundancy, rights, and delivery timeline |
| Media publishing           | Not started | Unassigned | TBD    | Define review, archive, speaker/session association, public recap, and retention workflow                              |

## Feedback and Reporting

| Work item                | Status      | Owner      | Target | Current note / next action                                                                                                  |
| ------------------------ | ----------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Feedback survey          | Not started | Elvis      | TBD    | Event feedback forms and QR display exist; define annual questions, session mapping, opening/closing, and audience segments |
| Feedback QR distribution | Not started | Unassigned | TBD    | Decide stage display, room signage, closing remarks, attendee messages, and post-event placement                            |
| Conference report        | Not started | Unassigned | TBD    | Agree reporting for attendance, programme, speakers, volunteers, sponsors, expenses, feedback, media, and lessons learned   |
| Retrospective            | Not started | Unassigned | TBD    | Schedule owner debrief, capture decisions and misses, and roll reusable tasks into the next annual edition                  |

## Budget and Expenses

Expenses are part of the confirmed annual-conference scope. The first implementation is a private, GHS-denominated ledger and dashboard. Owners can enter budget lines, expenses, and income; named Organizers can be granted read-only finance visibility for an edition.

| Work item                           | Status      | Owner      | Target     | Current note / next action                                                                                                                                                                         |
| ----------------------------------- | ----------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Budget baseline                     | In progress | Owner      | 2026-08-05 | GHS budget lines, committed spend, paid spend, remaining budget, and category variance are visible in the private Finance workspace                                                                |
| Expense categories                  | In progress | Owner      | 2026-08-05 | Initial categories cover venue, catering, AV/connectivity, creative/printing, media, badges, signage, swag, transport, speaker support, contingency, and other                                     |
| Expense request and approval policy | Not started | Unassigned | TBD        | The first slice records explicit draft, committed, paid, expected, partly received, received, and cancelled states; approval and reimbursement policy remains next                                 |
| Purchases and supplier commitments  | In progress | Owner      | 2026-08-05 | Owner-managed expense records capture vendor/source, amount, date, category, status, and notes                                                                                                     |
| Receipts and supporting documents   | Not started | Unassigned | TBD        | Define required evidence, secure storage, retention, and who can access it                                                                                                                         |
| Reimbursements                      | Not started | Unassigned | TBD        | Track claimant, purpose, approved amount, paid amount, payment method, status, and payment date                                                                                                    |
| Actual versus budget                | In progress | Owner      | 2026-08-05 | Dashboard reports planned, committed, paid, unpaid committed, remaining, and category variance                                                                                                     |
| Sponsorship income                  | In progress | Owner      | 2026-08-08 | Manual commitments retain their original promise, revisions, partial receipts, and outstanding GHS balance; a sponsor pipeline is still needed before source-linked sponsorship rows are automatic |

### Finance Safety Boundaries

- Financial details are private and never part of the public event API.
- Financial access must be more restrictive than general organizer access.
- The app must preserve who requested, approved, changed, and marked a financial record paid.
- The current edition finance currency is explicitly GHS (Ghana cedis); mixed-currency support is not included in this first slice.
- Receipts and contracts still need private storage, access control, and retention rules before attachments are added.
- Budget, committed cost, actual payment, reimbursement, and sponsor income are different records and must not be collapsed into one number.
- Ticket and sponsor modules must own their payment/reconciliation facts; Finance receives source-linked rollups and must not permit manual edits to those derived records.

## Current Application Coverage

| Area       | Current foundation                                                                   | Annual-conference gap                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Volunteers | Public form, Turnstile, QR display, organizer list                                   | Reusable campaign, richer application, review statuses, roles, assignments, communications, and relational storage      |
| Speakers   | Monthly CFP, proposal review, private speaker links                                  | Annual CFP, talk/workshop format, technical requirements, review committee, programme/room workflow, and communications |
| Programme  | Editable and reorderable outline rows                                                | Annual edition, rooms/tracks, facilitator assignment, conflicts, and publication                                        |
| Feedback   | Public form, protected QR display, response review                                   | Annual survey design, session/track mapping, campaign schedule, and conference report                                   |
| Attendance | Native free registration plus name/email check-in; historical Luma CSV compatibility | Paid ticket ownership, live paid capacity, badges, payments/refunds, reconciliation, and privacy/retention rules        |
| Tasks      | No durable conference workflow                                                       | Workstreams, owners, deadlines, dependencies, status, audit history, and views by person/team                           |
| Sponsors   | No conference pipeline                                                               | Contacts, stages, commitments, finance, deliverables, fulfilment, and reporting                                         |
| Expenses   | No budget or expense workflow                                                        | Budget, approvals, purchases, receipts, reimbursements, payments, income, audit, and variance                           |

## Decision Log

| Date       | Decision                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-26 | Treat the December event as an annual conference series with a yearly edition, not as a generic special meetup                               |
| 2026-07-26 | Maintain this plan jointly and assign named owners, dates, and statuses as organizer planning proceeds                                       |
| 2026-07-26 | Include budget and expenses in conference operations while leaving approval, currency, and financial-access rules open for design            |
| 2026-07-26 | Keep the annual conference inside the existing organizer console as its own edition-scoped workspace while regular event operations continue |
| 2026-07-26 | Preserve the current December 2026 volunteer link and make any new 2026 link feed the same campaign and volunteer list                       |

## Change Log

| Date       | Change                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-26 | Created the living December 2026 plan from the initial organizer checklist and mapped current application foundations versus missing conference capabilities |
| 2026-07-26 | Added the annual-workspace information architecture, coexistence rules, module boundaries, and incremental delivery order                                    |
| 2026-07-26 | Recorded the volunteer public-link, campaign-data, organizer-route, QR, and relational-migration continuity contract                                         |

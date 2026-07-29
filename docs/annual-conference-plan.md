# DevCongress Annual Conference Plan

**Active edition:** December 2026

**Plan status:** Active planning; Overview and Work plan available

**Last updated:** 2026-07-26

**Maintainers:** DevCongress organizers; Angela (`angelateyvi@gmail.com`) manages new task creation

This is the living operational plan for the annual December conference. Update it as decisions are made, work starts, ownership changes, or application support is added.

The durable product and domain rules remain in the [Product Operating Model](product-operating-model.md).

## How To Maintain This Plan

Use these statuses consistently:

| Status | Meaning |
| --- | --- |
| Not started | Agreed work that has not begun |
| In progress | Someone is actively delivering the annual-conference requirement |
| Blocked | Work cannot proceed until the named dependency is resolved |
| Done | The December 2026 requirement is complete and verified |

For every row:

- assign one accountable owner;
- list everyone else involved as collaborators;
- add a realistic target date;
- keep dependencies and the next concrete action visible;
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
- `/organizer-console/annual-conference/2026` is the active-edition overview;
- the provisional date is **19 December 2026**;
- Work plan is live at `/organizer-console/annual-conference/2026/work-plan`, seeded once from `DevCongress 2026 — Event Checklist.xlsx`;
- Volunteers is nested at `/organizer-console/annual-conference/2026/volunteers`;
- Overview, Work plan, and Volunteers are interactive today; future modules remain visible as planned structure rather than empty routes;
- the former organizer volunteer paths redirect to the new workspace;
- the existing public form, QR link, campaign ID, submission API, and stored applications are unchanged.
- every authenticated organizer can edit every task, while only `angelateyvi@gmail.com` can add a task;
- the first named spreadsheet owner is accountable and the remaining names are collaborators; `All`, `TBD`, and blank owners remain unassigned;
- new owner and collaborator selections use active organizer emails as stable identities, while the UI shows organizer names and preserves unchanged legacy spreadsheet assignments;
- finance is deferred to a later restricted module, and reminders are not part of this release.

The work plan uses relational `annual_conference_editions` and `annual_conference_tasks` Supabase tables in production, with a local JSON fallback for development. The one-time seed contains 26 tasks: 24 Not started and 2 Done.

### Annual workspace modules

| Module | Responsibility | Initial scope |
| --- | --- | --- |
| Overview | One operational picture of the active edition | Key decisions, milestones, owners, blockers, readiness, and cross-workstream status |
| Work plan | Replace the shared spreadsheet | Workstreams, tasks, owners, deadlines, dependencies, priority, status, and activity history |
| Programme | Build what happens on stage and in rooms | CFP, reviews, keynotes, speakers, talks/workshops/panels/demos, rooms, technical needs, and run of show |
| Volunteers | Move from interest to useful assignments | Intake, review, roles, teams, shifts, assignments, briefing, and status |
| Registration | Manage the attendee journey | Registration/ticketing, capacity, attendee communication, check-in, badges, cancellations, and refunds where applicable |
| Sponsors | Manage relationships and fulfilment | Prospects, packages, stages, contacts, commitments, payments, benefits, and deliverables |
| Logistics and production | Prepare the physical and technical event | Venue, rooms, catering, AV, connectivity, signage, swag, safety, setup, and day-of runbooks |
| Marketing and media | Coordinate public communication and content | Website inputs, flyers, stage/backdrop, campaigns, photography, video, livestream, and publishing |
| Budget and expenses | Control private conference finance | Budget, approvals, commitments, expenses, receipts, reimbursements, sponsor income, and variance |
| Feedback and reports | Learn from the edition | Survey, QR distribution, responses, conference report, retrospective, and reusable lessons |
| Settings and access | Protect and configure the edition | Edition details, phases, workstream leads, scoped permissions, data visibility, and archive controls |

### Coexistence rules

- The annual workspace uses the same event, people, access, audit, storage, and public API foundations as the rest of the platform.
- Conference data is scoped to its annual edition so December 2026 work does not appear in monthly-event workflows.
- A person has one identity but may have different engagements across events: organizer, workstream lead, volunteer, speaker, attendee, or sponsor contact.
- Access is capability- and edition-scoped. A volunteer or speaker does not gain the full organizer console.
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

| Contract | Requirement |
| --- | --- |
| Existing public path | Keep `/volunteer/december-mega-meetup` working for December 2026 |
| Existing submission API | Keep `POST /api/volunteer-applications` compatible until a versioned replacement is available |
| Existing campaign | Treat `december-mega-meetup` as the legacy identifier for the December 2026 volunteer campaign |
| New 2026 link | If introduced, make it an alias for the same edition/campaign so both links update the same volunteer list |
| Existing submissions | Migrate IDs, contact data, and creation timestamps; do not start the annual workspace with an empty list |
| Organizer location | Move the working view to Annual Conference → December 2026 → Volunteers, while preserving the current organizer route as a redirect or alias |
| Existing QR codes | Keep them valid through the compatibility route |
| Future editions | Give December 2027 and later editions distinct campaign IDs and links; never silently reuse the 2026 campaign |

The intended result is one December 2026 volunteer dataset regardless of which valid 2026 link an applicant follows.

## Current Edition Decisions

| Decision | Status | Owner | Target | Notes |
| --- | --- | --- | --- | --- |
| Exact date or dates | Done | Unassigned | 19 Dec 2026 | 19 December 2026 is the provisional starting point; confirmation remains a later decision |
| Conference theme | Not started | Unassigned | TBD | Gates keynote outreach, CFP framing, programme, sponsorship deck, and creative |
| Venue | Not started | Angela | TBD | UPSA and Accra Digital Centre are the current candidates; Elijah and Elvis collaborate |
| Attendance target | Not started | Unassigned | TBD | Needed for capacity, ticketing, catering, badges, swag, connectivity, and budget |
| Keynote speaker or speakers | Not started | Elijah | TBD | Patrick G. Awuah is preferred; the original shortlist also mentioned the NSMQ quiz mistress |
| Ticketing approach | In progress | Unassigned | TBD | Paid registration is confirmed for December; choose the payment provider and define payment, refund, reconciliation, and failure ownership after the free monthly flow is proven |
| Overall conference budget | Not started | Unassigned | TBD | Deferred to the later restricted finance module |

## Programme and Speakers

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Put out the Call for Speakers | Not started | Unassigned | TBD | Define submission criteria, deadline, review committee, selection rubric, and response timeline |
| Annual speaker submission form | Not started | Elvis | TBD | Ernest collaborates; define the annual form for name, bio, topic, abstract, talk/workshop format, and technical requirements |
| Speaker review committee | Not started | Unassigned | TBD | Name reviewers, resolve conflicts, and define selection/communication responsibilities |
| Keynote outreach | Blocked | Unassigned | TBD | Starts after date, theme, venue confidence, and shortlist confirmation |
| Workshops and breakout sessions | Not started | Unassigned | TBD | Assign facilitators, rooms, capacity, materials, equipment, and support volunteers |
| Panel discussions | Not started | Unassigned | TBD | Define topics, moderator, panelists, duration, and audience-question format |
| Demo sessions | Not started | Unassigned | TBD | Confirm presenters, time slots, power, network, projection, and fallback needs |
| Programme outline | Not started | Angela | TBD | Build the December run of show after sessions and rooms are known |
| Speaker communications | Not started | Unassigned | TBD | Plan acceptance, rejection, logistics, reminders, slides/materials, and day-of instructions |

## Volunteers and Work Assignments

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Call for Volunteers | Not started | Elvis | TBD | Ernest collaborates; define the outreach window and target volunteer count |
| Volunteer submission form | Done | Elvis | TBD | The public form is live; Ernest collaborates. Review, assignment, briefing, and communications are separate later-stage tasks |
| Volunteer roles and staffing plan | Not started | Unassigned | TBD | Define teams, role descriptions, shift windows, team leads, and headcount per area |
| Application review and selection | Not started | Unassigned | TBD | Organizer review lives under Annual Conference → December 2026 → Volunteers; add decisions, status, notes, and duplicate/person handling in the relational workflow |
| Workstreams and task assignment | Not started | Unassigned | TBD | Replace the December spreadsheet with workstreams, tasks, owners, deadlines, dependencies, and completion status |
| Volunteer communication and briefing | Not started | Unassigned | TBD | Plan acceptance, team allocation, training, reminders, escalation contacts, and day-of check-in |

## Website, Registration, and Attendee Journey

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Conference website/page | Not started | Unassigned | TBD | Public page on `devcongress.org` should cover the theme, venue, programme, speakers, sponsors, forms, and attendee actions |
| Registration or ticketing | Not started | Unassigned | TBD | Decide provider, capacity rules, ticket classes, confirmation, check-in, cancellation, payments, refunds, and attendee-data ownership |
| Registration forms and embeds | In progress | Unassigned | TBD | Extend the internal native registration foundation with paid checkout for December; keep event, attendee, payment, CFP, volunteer, sponsor, and feedback ownership explicit |
| Badges and lanyards | Not started | Unassigned | TBD | Define badge data, design, printing, pickup, walk-ins, reprints, and check-in-system integration |
| Attendee communications | Not started | Unassigned | TBD | Plan confirmation, reminders, venue guidance, programme changes, and post-event follow-up |

## Sponsorships and Partners

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Sponsorship packages | Not started | Unassigned | TBD | Define tiers, pricing, benefits, inventory, limits, deliverables, and the sponsor deck |
| Sponsor and partner call | Blocked | Unassigned | TBD | Launch after packages, theme, audience profile, budget need, and contact list are ready |
| Sponsorship pipeline | Not started | Unassigned | TBD | Track prospects, owner, stage, next action, contact history, commitment, invoice/payment, and deliverables |
| Sponsor fulfilment | Not started | Unassigned | TBD | Track logos, mentions, booths, speaking benefits, passes, branding placement, and post-event reporting |

## Venue, Production, and Attendee Experience

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Venue and room plan | Not started | Angela | TBD | UPSA and Accra Digital Centre are under consideration; confirm capacity, breakout rooms, accessibility, setup/teardown time, furniture, security, and emergency arrangements |
| Catering | Not started | Unassigned | TBD | Plan breakfast and lunch, headcount, dietary needs, serving schedule, water, vendor, and waste handling |
| AV equipment | Not started | Unassigned | TBD | Inventory microphones, projectors, screens, adapters, presentation machines, audio, lighting, and breakout-room equipment |
| Wi-Fi and connectivity | Not started | Unassigned | TBD | Validate high-density bandwidth, guest access, speaker/demo needs, livestream capacity, support, and backup connectivity |
| Signage and wayfinding | Not started | Unassigned | TBD | Plan room labels, directional signs, programme boards, registration markers, sponsor signs, and accessibility cues |
| Swag and merchandise | Not started | Unassigned | TBD | Decide items, quantities, sizes, sponsor branding, sourcing, distribution, and leftovers |
| Day-of operations | Not started | Unassigned | TBD | Build setup, registration, room, speaker, volunteer, incident, and teardown runbooks |

## Creative, Marketing, and Brand

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Flyer designs | Not started | Unassigned | TBD | Produce digital and print variants plus sizes for social, web, email, partners, and venue display |
| Backdrop and stage designs | Not started | Unassigned | TBD | Cover main stage, photo wall, lectern/screens, sponsor placement, and reusable branding elements |
| Marketing plan | Not started | Unassigned | TBD | Define audiences, announcement sequence, channels, content calendar, partners, owners, and measurement |
| Programme and speaker promotion | Not started | Unassigned | TBD | Plan announcement assets, approvals, speaker kits, and schedule |

## Photography, Video, and Livestream

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Photography | Not started | Unassigned | TBD | Book photographer, agree shot list, usage rights, delivery format, storage, and timeline |
| Videography and livestream | Not started | Unassigned | TBD | Book team, choose platform, define recording setup, room coverage, captions, redundancy, rights, and delivery timeline |
| Media publishing | Not started | Unassigned | TBD | Define review, archive, speaker/session association, public recap, and retention workflow |

## Feedback and Reporting

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Feedback survey | Not started | Elvis | TBD | Event feedback forms and QR display exist; define annual questions, session mapping, opening/closing, and audience segments |
| Feedback QR distribution | Not started | Unassigned | TBD | Decide stage display, room signage, closing remarks, attendee messages, and post-event placement |
| Conference report | Not started | Unassigned | TBD | Agree reporting for attendance, programme, speakers, volunteers, sponsors, expenses, feedback, media, and lessons learned |
| Retrospective | Not started | Unassigned | TBD | Schedule owner debrief, capture decisions and misses, and roll reusable tasks into the next annual edition |

## Budget and Expenses

Expenses are part of the confirmed annual-conference scope. The workflow and permissions are not designed yet.

| Work item | Status | Owner | Target | Current note / next action |
| --- | --- | --- | --- | --- |
| Budget baseline | Not started | Unassigned | TBD | Set expected income, planned spend by category, contingency, and total ceiling |
| Expense categories | Not started | Unassigned | TBD | Start with venue, catering, AV/connectivity, creative/printing, media, badges, signage, swag, transport, speaker support, and contingency |
| Expense request and approval policy | Not started | Unassigned | TBD | Deferred to the later restricted finance module; define who can request, approve, reject, amend, and view financial records |
| Purchases and supplier commitments | Not started | Unassigned | TBD | Track vendor, quote, approved amount, order/contract, due date, owner, and payment status |
| Receipts and supporting documents | Not started | Unassigned | TBD | Define required evidence, secure storage, retention, and who can access it |
| Reimbursements | Not started | Unassigned | TBD | Track claimant, purpose, approved amount, paid amount, payment method, status, and payment date |
| Actual versus budget | Not started | Unassigned | TBD | Report committed, spent, remaining, and variance by category and for the whole edition |
| Sponsorship income | Not started | Unassigned | TBD | Track pledged, invoiced, received, restricted/earmarked, outstanding, and reconciled amounts separately from expenses |

### Finance Safety Boundaries

- Financial details are private and never part of the public event API.
- Financial access must be more restrictive than general organizer access.
- The app must preserve who requested, approved, changed, and marked a financial record paid.
- Money values require an explicit currency; the default currency has not yet been decided.
- Receipts and contracts need private storage, access control, and retention rules.
- Budget, committed cost, actual payment, reimbursement, and sponsor income are different records and must not be collapsed into one number.

## Current Application Coverage

| Area | Current foundation | Annual-conference gap |
| --- | --- | --- |
| Volunteers | Public form, Turnstile, QR display, organizer list | Reusable campaign, richer application, review statuses, roles, assignments, communications, and relational storage |
| Speakers | Monthly CFP, proposal review, private speaker links | Annual CFP, talk/workshop format, technical requirements, review committee, programme/room workflow, and communications |
| Programme | Editable and reorderable outline rows | Annual edition, rooms/tracks, facilitator assignment, conflicts, and publication |
| Feedback | Public form, protected QR display, response review | Annual survey design, session/track mapping, campaign schedule, and conference report |
| Attendance | Native free registration plus name/email check-in; historical Luma CSV compatibility | Paid ticket ownership, live paid capacity, badges, payments/refunds, reconciliation, and privacy/retention rules |
| Tasks | No durable conference workflow | Workstreams, owners, deadlines, dependencies, status, audit history, and views by person/team |
| Sponsors | No conference pipeline | Contacts, stages, commitments, finance, deliverables, fulfilment, and reporting |
| Expenses | No budget or expense workflow | Budget, approvals, purchases, receipts, reimbursements, payments, income, audit, and variance |

## Decision Log

| Date | Decision |
| --- | --- |
| 2026-07-26 | Treat the December event as an annual conference series with a yearly edition, not as a generic special meetup |
| 2026-07-26 | Maintain this plan jointly and assign named owners, dates, and statuses as organizer planning proceeds |
| 2026-07-26 | Include budget and expenses in conference operations while leaving approval, currency, and financial-access rules open for design |
| 2026-07-26 | Keep the annual conference inside the existing organizer console as its own edition-scoped workspace while regular event operations continue |
| 2026-07-26 | Preserve the current December 2026 volunteer link and make any new 2026 link feed the same campaign and volunteer list |

## Change Log

| Date | Change |
| --- | --- |
| 2026-07-26 | Created the living December 2026 plan from the initial organizer checklist and mapped current application foundations versus missing conference capabilities |
| 2026-07-26 | Added the annual-workspace information architecture, coexistence rules, module boundaries, and incremental delivery order |
| 2026-07-26 | Recorded the volunteer public-link, campaign-data, organizer-route, QR, and relational-migration continuity contract |

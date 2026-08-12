# DevCongress Product Operating Model

**Status:** Confirmed product direction; implementation will be incremental

**Last reviewed:** 2026-07-26

This document is the shared product and domain reference for DevCongress event operations. It records the decisions that should guide future data models, APIs, permissions, and feature work.

It does not mean every capability below exists today. Sections distinguish the current boundary, confirmed direction, and planned work.

## Maintenance Rule

Update this document whenever a new product boundary, event category, role/access rule, public-data rule, or delivery dependency is agreed. Record architectural choices in [Architectural Decisions](decisions.md), and keep edition-specific owners, dates, status, and tasks in the [Annual Conference Plan](annual-conference-plan.md).

## 1. Product Purpose

Events Management is no longer only an administration tool for monthly meetups.

It is the operational backbone for DevCongress throughout the year:

- monthly meetups;
- quarterly meetups;
- special DevCongress events;
- the annual December Mega Meetup/conference;
- the people who organize, speak, volunteer, attend, or support those events;
- approved external events listed for the wider community.

The goal is to help the team operate events, preserve institutional knowledge, and make better decisions from consistent operational data.

## 2. System Boundary

| Surface | Responsibility |
| --- | --- |
| `events-management` | Private operations, workflows, moderation, access control, durable event data, and the read-only public integration API |
| `devcongress.org` | The public website, public event discovery, and gated public event-submission entry point |
| Supabase | Durable relational system of record for dynamic product data |
| Cloudflare | Application hosting, routing, and edge protection |

`events-management` remains the source of truth. `devcongress.org` consumes approved, published data through the public API.

Private operational data must not be exposed merely because an event is public.

## 3. Event Classification

An event must not be represented by one overloaded “type” field. These are independent dimensions.

| Dimension | Meaning | Initial values |
| --- | --- | --- |
| Ownership | Who owns and is accountable for the event | `devcongress`, `external` |
| DevCongress series | The recurring DevCongress programme, when applicable | `monthly`, `quarterly`, `annual`, `special`, or none |
| Format | What kind of event it is | `meetup`, `conference`, `workshop`, `hackathon`, `webinar`, `other` |
| Submission source | How the record entered the platform | `internal`, `public_submission` |
| Moderation status | Whether a submitted external event may be listed | `pending`, `approved`, `rejected` |
| Publication status | Whether an event is visible publicly | `draft`, `published`, `archived` |

### Classification rules

- Only DevCongress-owned events can belong to a DevCongress series.
- `special` is a DevCongress series, not a catch-all for external events.
- An approved external event is listed by DevCongress; it is not automatically owned, organized, endorsed, or sponsored by DevCongress.
- Approval and publication are separate decisions.
- Archived events are hidden from organizer lists, public feeds, short links, and registration entry points. Owners may restore a soft-archived event only while its restore window is open and the event timeline is still viable.
- An external event must retain its actual organizer identity and source.

### Examples

| Event | Ownership | Series | Format | Source |
| --- | --- | --- | --- | --- |
| DevCongress August Meetup | DevCongress | Monthly | Meetup | Internal |
| DevCongress Q3 Meetup | DevCongress | Quarterly | Meetup | Internal |
| DevCongress December 2026 | DevCongress | Annual | Conference | Internal |
| A one-off DevCongress workshop | DevCongress | Special | Workshop | Internal |
| An outsider-submitted workshop | External | None | Workshop | Public submission |

## 4. Annual December Conference

The December Mega Meetup is a first-class annual conference, not another value hidden under `special`.

Each year is an edition of the annual series, for example December 2026 and December 2027. The edition is the shared operational context for its people, programme, work, sponsors, tickets, and reporting.

Inside the organizer console, the annual conference is a first-class edition-scoped workspace alongside regular Events. It is not a separate application and should not overload the generic monthly-event screen. Shared people, access, audit, storage, and public API foundations remain common, while conference modules evolve independently and incrementally.

### Current foundation

- A public December volunteer-interest form exists for the 2026 campaign.
- Organizers can review volunteer applications.

### Confirmed direction

The annual conference workspace should grow to cover:

- volunteer intake, review, assignment, and status;
- workstreams, tasks, owners, deadlines, and completion tracking;
- speakers and sessions, including talks, workshops, panels, and other formats;
- budgets, expenses, approvals, receipts, reimbursements, income, and variance reporting;
- organizer visibility across the whole edition;
- operational history that replaces fragmented spreadsheets.

The current edition-level workstreams are maintained in the [Annual Conference Plan](annual-conference-plan.md).

### Later modules

These are anticipated but not yet specified:

- ticketing and attendee lifecycle;
- sponsors, contacts, commitments, and deliverables;
- venue and logistics;
- communications and reminders;
- conference-level reporting.

These modules should attach to the annual event edition instead of becoming isolated tools.

## 5. People, Roles, and Access

A person is not permanently one kind of user. The same person may organize a monthly meetup, speak at the annual conference, and volunteer for a different event.

The model must separate:

1. **Person** — stable identity and contact record.
2. **Platform membership** — privileged access such as administrator or organizer.
3. **Event engagement** — a role held for a particular event or edition, such as speaker, volunteer, attendee, or sponsor contact.
4. **Assignment** — work owned by a person within an event or workstream.

### Access rules

- Organizer or administrator access remains explicit and privileged.
- A speaker does not automatically receive organizer access.
- A volunteer does not automatically receive organizer access.
- Permissions should be scoped to the event and capability required.
- An authenticated annual-conference volunteer sees only the active edition overview and tasks where their email is the accountable owner or a collaborator.
- Volunteers may update the status of their assigned tasks, but cannot change task ownership/details or access organizer-wide operations and private applicant records.
- Speaker category comes from the event engagement, not permanent labels such as “monthly speaker” or “December speaker.”
- Session format belongs to the programme item: talk, workshop, panel, and so on.
- Event deletion is Owner-only. Organizers can operate events but cannot soft-delete, hard-delete, or restore them.

The membership role now includes a deliberately narrow `volunteer` option for the active annual edition. Future multi-edition access should move the edition engagement out of this platform-level role instead of broadening it into permanent cross-edition access.

## 6. Public API Contract

The existing public meetup API will be extended, not replaced.

Current consumers must keep working while the contract grows beyond monthly and quarterly meetups. Meetup-specific route names may remain as compatibility routes until a broader contract can be introduced without breaking `devcongress.org`.

### Compatibility rules

- Keep existing response fields and meanings stable.
- Add new fields additively.
- Do not silently reinterpret existing values.
- Publish only approved public records.
- Integrate and validate `devcongress.org` before building the public-submission workflow.

### Public data may include

- ownership and DevCongress series;
- event format and annual edition;
- public title, summary, dates, venue, and media;
- registration or ticket URL;
- confirmed public speakers and sessions;
- public sponsors;
- recap links and media;
- feedback availability;
- a public volunteer-signup URL when a campaign is open;
- the external organizer’s name and URL for listed external events.

### Data that must remain private

- volunteer contact details and internal assignments;
- pending or rejected event submissions;
- pending speaker applications;
- organizer notes;
- sponsor negotiations, contracts, and financial details;
- budgets, expense requests, receipts, reimbursements, and payment records;
- ticket-holder or attendee private data;
- authentication and audit records.

See [Public Meetup API](public-meetups-api.md) for the current implemented contract.

## 7. External Event Submissions

The community-submission workflow is implemented in Events Management. The public form remains owned by `devcongress.org`.

The intended flow is:

1. An outsider submits an event through `devcongress.org`.
2. The submission enters `events-management` as `pending`.
3. An authorized reviewer approves or rejects it.
4. Approval creates or promotes a canonical external-event record.
5. Publication makes the approved event available through the same public API consumed by `devcongress.org`.

The public listing must identify the real organizer. “Approved” means permitted to appear in the DevCongress listing; it does not transfer ownership to DevCongress.

The initial organizer surface intentionally keeps review to **Approve & publish** or **Reject**. Approval and publication remain independent database fields, and the API can approve as a draft without changing the taxonomy. Receipt/decision email delivery remains a follow-up until it has durable delivery state.

## 8. Persistence Direction

New durable multi-user workflows must use relational Supabase tables with database constraints.

The existing shared JSON-document compatibility store remains useful for transitional features, but it is not the foundation for:

- task assignment;
- reusable annual volunteer campaigns;
- event-scoped roles and permissions;
- sponsors or ticketing;
- moderation queues;
- cross-event reporting.

Those areas need relational entities so concurrency, uniqueness, authorization, and reporting are enforced below the UI layer.

## 9. Delivery Sequence and Dependencies

```text
Shared event and people model
├── Extend existing public API
│   └── Integrate and validate devcongress.org
│       └── Add external event submission and moderation
└── Build annual conference operations
    ├── Volunteer lifecycle
    ├── Workstreams and task assignments
    ├── Speaker and programme operations
    └── Later: ticketing, sponsors, logistics, communications
```

The annual-operations track can proceed alongside the public-website track once both use the shared event and people model.

## 10. Confirmed Decisions

- Events Management is the year-round operational backbone.
- The December Mega Meetup is an annual conference series with yearly editions.
- The annual conference is a first-class workspace inside the existing organizer console while regular event operations continue.
- Existing public campaign links remain compatible through workspace and storage migrations; replacement links for the same edition resolve to the same campaign data.
- Event ownership, series, format, source, moderation, and publication are separate concepts.
- External events are not DevCongress events merely because DevCongress lists them.
- People can hold multiple event-scoped roles.
- Volunteer and speaker status does not grant organizer access.
- The current public API is extended compatibly rather than replaced.
- `devcongress.org` integration precedes the public event-submission workflow.
- New durable operational domains move to relational Supabase storage.

## 11. Open Decisions

These require separate product or technical decisions before implementation:

- the exact capability matrix for administrators, organizers, team leads, volunteers, and speakers;
- whether a broader public `/events` namespace should eventually sit beside the compatibility meetup routes;
- the annual conference task/workstream workflow and notification rules;
- expense approval levels, financial roles, currency, document retention, and reimbursement rules;
- ticketing provider and payment ownership;
- sponsor pipeline stages and financial-access boundaries;
- external-event review criteria, expiry, and appeal/edit flow;
- data-retention rules for applicants, attendees, and external submitters.

## 12. Revisit Triggers

Review this operating model when:

- a new event series or ownership model is introduced;
- roles need cross-event permissions not covered here;
- the public API requires a breaking version;
- ticketing or sponsor finance introduces a new compliance boundary;
- DevCongress begins co-owning external events rather than only listing them.

# Form polish audit — deferred backlog

Date: 2026-09-07. Status: deferred at the user's request. This document preserves the research; it does not authorize the wider rollout.

## Scope and findings

Source inventory on `feature/shared-form-polish`: 41 form blocks in 29 Vue files, plus inline editors, filters, and shared controls. Counts include conditional and paused/prototype forms. This was source-based research, not a browser or screen-reader certification of every route.

The shared control baseline exists, but app-wide hierarchy, semantic labels, validation recovery, and feedback are not complete. Standardize the form language, not every form's layout.

Confirmed follow-up candidates:

- Shared `#aaa79f` input borders have approximately 2.40:1 contrast against white; improve boundaries where needed to identify controls.
- Public feedback question fieldsets need associated legends/labels; Yes/No selection needs programmatic state.
- Feedback-builder choice options need persistent labels, meaningful remove names, stable identities, and focus recovery.
- Dropdown viewport clamping remains opt-in. Test pages, drawers, dialogs, and nested scroll containers individually rather than enabling body teleport globally.
- Multi-select labels with trailing notes can still truncate because the wrapping rule targets the last span. Target option labels explicitly.
- Consider type-ahead for longer dropdown lists.
- Organizer access retains important geometry/font overrides; finance mixes compact dropdowns with regular fields. Establish explicit regular-field and compact-toolbar density rules.
- Existing source tests cover shared CSS adoption, not rendered contrast, labels, error recovery, or every mobile route.

## Design direction

Retain understated, stationary dots and braces around suitable public forms, with solid input surfaces. Use quiet task-specific sections, consistent field labels/help/errors, immediate pending feedback, confirmed success, preserved values after failure, and deliberate focus placement. Avoid decorative movement while typing.

Three layouts: short single-page form; longer intake with logical steps where useful; organizer editor with sections or focused drawers. Preserve the conference CFP's explicit outcome-count submit restriction; do not make unexplained disabled buttons the universal validation pattern.

## Rollout map

1. Shared foundation: contrast, density, labels/help/errors, dropdown positioning and wrapping.
2. Public intake: conference/monthly CFP, accepted-speaker logistics/archive, registration, volunteer, event amendment, event feedback, route feedback and feedback bot. Short registration/volunteer forms should remain single-page. Conference CFP now uses steps on both desktop and mobile by explicit user decision.
3. Organizer forms: event creation/community editing, registration settings, desktop/mobile blasts, conference tasks/editions/phases, annual/monthly finance, organizer access/delegation, speaker email/backfill and moderation replies.
4. Builders and inline editors: feedback campaigns/questions/options, system-design teaching questions, quiz builder, event outline/media/artifacts.
5. Small surfaces: login, nickname, room name, filters, check-in, deadline controls. Preserve specialized controls. Defer major work on paused speaker/leaderboard prototype forms.

Suggested next pilots: public feedback and the conference task drawer. Review independently before delivery. Verification should cover 320px layouts, zoom/reflow, long labels, mobile keyboards, bottom-edge menus, dialog focus, reduced motion, failed submissions, and draft preservation. Aim for 44px touch controls as a product preference; WCAG AA's minimum is 24px with exceptions.

## Research sources

- [Emil Kowalski: You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations): purposeful motion and frequency of use.
- [Emil Kowalski: 7 Practical Animation Tips](https://emilkowal.ski/ui/7-practical-animation-tips): immediate feedback and restrained interaction timing.
- [W3C: Grouping Controls](https://www.w3.org/WAI/tutorials/forms/grouping/): visual and semantic grouping.
- [W3C: Multi-page Forms](https://www.w3.org/WAI/tutorials/forms/multi-page/): logical stages and progress.
- [GOV.UK: Question pages](https://design-system.service.gov.uk/patterns/question-pages/): task-appropriate grouping and repeat-user workflows.
- [W3C: Labels](https://www.w3.org/WAI/tutorials/forms/labels/) and [notifications](https://www.w3.org/WAI/tutorials/forms/notifications/): associated controls and actionable feedback.
- [GOV.UK: Buttons](https://design-system.service.gov.uk/components/button/): caution around disabled actions.
- [W3C: Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/): keyboard interaction and type-ahead.
- [W3C: Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): verification criteria.

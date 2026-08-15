# Owner Email Previews

## Overview

Owners can open **Audit Log → Email previews** to inspect the recipient experience for every email EMS currently sends. It sits beside **Email delivery** so owners can move between what EMS sends and how those messages are currently being accepted by the provider. The subsection is read-only: selecting a scenario renders sample content through the same code-owned template function used by live delivery, and no preview action sends or queues an email.

The catalog currently covers 12 active scenarios:

- confirmed, waitlisted, and promoted event registrations;
- organizer-authored event updates;
- community-event receipt, approval, rejection, amendment approval, amendment rejection, and listing removal;
- speaker archive requests and missing-material follow-ups.

Five Annual Conference email scenarios remain visible under **Not active yet**. They are recorded as planned scenarios without invented renderings because EMS does not currently send them.

## Owner Flow

1. Open **Audit Log** from the owner navigation on a tablet or desktop, then choose **Email previews** beside **Email delivery**.
2. Choose a scenario from the recipient-based catalog.
3. Check the sender, sample recipient, subject, and explanation of when the email is sent.
4. Switch between the rendered email and its plain-text alternative.
5. Switch the rendered email between desktop and mobile email widths.

All names, addresses, event details, links, and dates in the catalog are labelled by context as sample preview content. The catalog does not query attendee, submitter, or speaker records.

## Rendering and Security

`lib/email/previews.ts` owns only the scenario metadata and safe sample fixtures. It calls the existing production renderers rather than duplicating their HTML:

- `eventRegistrationConfirmationEmail`;
- `eventBlastEmail`;
- `communityEventSubmissionEmail`;
- `monthlyArchiveRequestEmail`.

`GET /api/admin/email-previews` returns the owner-only catalog. Each visual preview loads from `GET /api/admin/email-previews/:previewId/html`, which is also owner-only and non-cacheable. The HTML document is isolated in a sandboxed iframe. Its response receives a narrow document CSP that permits email inline styles and approved brand images while blocking scripts, objects, forms, and every embedding origin except EMS itself. The organizer application retains its stricter default CSP.

`EMAIL_SCENARIOS` is the inventory contract. Tests fail when an active scenario has no preview, preventing a new send path from being silently omitted from the owner catalog.

## Key Files

| File | Purpose |
|---|---|
| `lib/email/previews.ts` | Sample fixtures and live preview catalog assembled from production renderers |
| `lib/email/scenarios.ts` | Active/planned email-scenario and sender inventory |
| `server/app.ts` | Owner-only catalog and isolated HTML document endpoints |
| `server/admin-api-access.ts` | Owner admission policy for both preview endpoints |
| `src/views/admin/AdminAuditLogView.vue` | Owner-only Audit Log section switcher containing Email delivery and Email previews as sibling operations views |
| `src/views/admin/AdminEmailPreviewsView.vue` | Embedded scenario browser, message metadata, format switcher, and responsive preview canvas |

## Verification

- Catalog parity tests cover every active scenario and keep planned scenarios separate.
- API tests verify the read-only route surface and unauthenticated rejection.
- Admin admission tests keep both catalog and HTML document routes Owner-only.
- Security-boundary tests preserve the strict application CSP while allowing only same-origin preview frames.
- Typecheck, production build, and production-build browser checks cover scenario selection, plain-text mode, and desktop/mobile email widths.

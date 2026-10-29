# Owner Email Previews

## Overview

Owners can open **Audit Log → Email previews** to inspect the recipient experience for emails EMS currently sends. Selecting a scenario renders sample content through the same code-owned template function used by live delivery. The Owner can explicitly send a test to their own authenticated session address to inspect it in an email client.

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
5. Switch the rendered email between desktop and mobile email widths. Use **Send me a test** to send the selected sample to the signed-in Owner address; provider acceptance does not prove inbox delivery.

All names, addresses, event details, links, and dates in the catalog are labelled by context as sample preview content. The catalog does not query attendee, submitter, or speaker records.

## Rendering and Security

`lib/email/previews.ts` owns only the scenario metadata and safe sample fixtures. It calls the existing production renderers rather than duplicating their HTML:

- `eventRegistrationConfirmationEmail`;
- `eventBlastEmail`;
- `communityEventSubmissionEmail`;
- `monthlyArchiveRequestEmail`.

`GET /api/admin/email-previews` returns the owner-only catalog. Each visual preview loads from `GET /api/admin/email-previews/:previewId/html`, which is also owner-only and non-cacheable. The HTML document is isolated in a sandboxed iframe. Its response receives a narrow document CSP that permits email inline styles and approved brand images while blocking scripts, objects, forms, and every embedding origin except EMS itself. The organizer application retains its stricter default CSP.

`POST /api/admin/email-previews/:previewId/send-test` accepts only a known server-side preview, checks Owner session and origin, sends only to that session's email, and applies a shared rate limit. It labels the subject as a test and never accepts a browser-provided recipient or template body. The Pages proxy preserves the preview document's restrictive CSP and permits same-origin preview frames.

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
- API tests verify unauthenticated rejection and test-send recipient, template, and rate-limit boundaries with a mocked provider.
- Admin admission tests keep the catalog, HTML document, and test-send routes Owner-only.
- Security-boundary tests preserve the strict application CSP while allowing only same-origin preview frames.
- Typecheck, production build, and production-build browser checks cover scenario selection, plain-text mode, and desktop/mobile email widths.

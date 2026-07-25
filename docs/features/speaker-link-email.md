# Speaker Link Email Delivery

## Status

Planned. This document defines the future delivery feature only; the application does not currently send email.

## Overview

Organizers will be able to send a DevCongress-branded email for a named speaker's private archive-backfill or selected-speaker slides link. The email is a convenience delivery channel for an already-issued link: it must not create a shared link, alter the speaker identity, or make the link public.

Supabase remains the system of record for organizer identity, audit history, and eventual delivery records. Resend performs transactional delivery. The existing authenticated Hono API Worker will call Resend directly, so no Supabase Edge Function is required for this first version.

## User Flows

### Send a backfill invitation

1. An organizer creates a speaker-bound backfill link in Legacy Backfill.
2. The link shelf shows the invited speaker's name, email, status, expiry, and a `Preview email` action.
3. The organizer previews the rendered message using the exact live speaker, event, URL, and expiry data.
4. The organizer chooses `Send email`.
5. The server sends only to the email stored on that link, records the delivery attempt, and returns a success or safe failure message.
6. A later `Resend email` uses the same active link; it does not create a second link or change the recipient.

### Send a selected-speaker slides reminder

1. An organizer selects a CFP proposal and the app creates that speaker's private slides link.
2. The organizer previews or sends the selected-speaker template from the proposal/speaker-link shelf.
3. The recipient receives a message containing the private link and its expiry.

### Link lifecycle

- Only active, named speaker links can be emailed.
- Used, expired, removed, or legacy anonymous links cannot be sent or resent.
- A recipient email is never editable in the send action; changing the recipient requires issuing a new speaker-bound link.
- The email contains both HTML and plain-text content.

## Sender and Domain

Use a dedicated transactional sending subdomain so speaker mail does not alter the Zoho mail setup on the root domain:

```text
From: DevCongress Speakers <speakers@updates.devcongress.org>
Reply-To: hello@devcongress.org
```

`updates.devcongress.org` is only a recommended name. If the DevCongress team chooses a different subdomain, update the sender configuration and templates together.

## Administrator Setup: Resend

Complete these steps before the email implementation is deployed.

1. Create or use the DevCongress Resend account.
2. In Resend, add and verify `updates.devcongress.org` as a sending domain.
3. In the Cloudflare DNS zone for `devcongress.org`, add the DNS records Resend supplies for that subdomain exactly as shown. These normally establish SPF and DKIM authentication.
4. Do **not** replace the existing root-domain Zoho MX or SPF records. The separate sending subdomain avoids that conflict.
5. Create a Resend API key for the production application. Keep it server-only and do not paste it in source code, chat, or browser configuration.
6. Add that value as the `RESEND_API_KEY` secret on the Cloudflare Worker that serves the organizer API. It must not use a `VITE_` prefix.
7. Send a test message to an organizer-controlled inbox and confirm the sender name, Reply-To address, link target, and spam-folder placement.

Optional later setup: configure the same Resend account as Supabase Auth's custom SMTP provider for branded authentication mail. Keep its authentication sender separate, for example `auth@auth.devcongress.org`, so login mail and speaker operations have independent sender reputations.

## Email Templates

Templates will be code-owned and versioned in this repository for the first release. Each template must render both HTML and plain text from the same structured input.

Required input:

```text
speakerName
speakerEmail
eventName
eventDate
intakeUrl
expiresAt
```

Required content:

- DevCongress branding and sender identity.
- A concise explanation of the requested action.
- One clear call to action linking to the speaker's private intake form.
- Event name and formatted event date.
- Explicit expiry date/time.
- A plain-text fallback URL.
- Reply-To guidance for questions.

Templates must not include organizer-only information, raw API responses, link tokens outside the generated URL, or public tracking pixels. The preview must use the real link data but must not send mail.

## Later Application Implementation

### Server

- Add a server-only `RESEND_API_KEY` configuration check.
- Add a small Resend client wrapper under `lib/email/`; browser code must never call Resend directly.
- Add typed template renderers under `lib/email/templates/`.
- Add an organizer-authorized endpoint conceptually shaped as:

  ```text
  POST /api/events/:eventId/speaker-intake-links/:linkId/send-email
  ```

- Resolve the link on the server and reject it unless it is active, speaker-bound, and belongs to the requested event.
- Derive the recipient exclusively from `link.speaker_email`; do not accept recipient email, subject, HTML, or link URL from the browser.
- Pass the provider request a stable idempotency key based on the link id and delivery purpose, so retrying a failed request cannot create accidental duplicates.
- Record an organizer audit entry containing the link id, recipient email, template id/version, provider message id, and outcome. Never store or log the raw intake token.
- Add a short resend cooldown per link and a maximum send count, with a visible reason when the action is unavailable.

### Organizer UI

- Show `Preview email`, `Send email`, and, after a successful send, `Resend email` on each named speaker link.
- Keep `Copy` and `Open` for organizers who prefer manual delivery.
- Show recipient, delivery status, sent time, send count, and any safe provider error beside the link.
- Do not expose delivery controls on the public speaker intake form.

### Persistence

Before broad use, add a durable `speaker_link_deliveries` record in Supabase rather than relying only on the JSON compatibility store. It should contain the link id, recipient email, template version, provider message id, attempt/result timestamps, and failure category. It must not contain the raw private URL/token.

## Key Files for the Later Change

| File or area | Future responsibility |
|---|---|
| `server/app.ts` | Organizer-authorized preview/send endpoints and audit calls |
| `lib/email/resend.ts` | Server-only Resend request wrapper |
| `lib/email/templates/` | Versioned speaker-link HTML and text templates |
| `src/views/admin/AdminTalksView.vue` | Preview/send/resend actions and delivery status in link shelves |
| `lib/supabase/` | Durable delivery-record persistence |
| `wrangler.toml` / Cloudflare Worker secrets | Runtime access to `RESEND_API_KEY` without browser exposure |

## Testing

Automated checks for the later implementation:

- Template snapshot/markup tests for both HTML and plain text.
- Server tests proving only an authenticated organizer can send.
- Tests proving recipient, event, and link URL come from the stored link—not the request body.
- Tests rejecting used, expired, anonymous legacy, removed, and cross-event links.
- Tests for resend cooldown and idempotency behavior.
- Tests that audit/delivery records never contain the raw token.

Manual release checks:

- Preview the two template types with a real but non-production link.
- Send to an organizer-controlled inbox and inspect desktop/mobile rendering.
- Confirm SPF/DKIM validation in Resend and check spam-folder placement.
- Verify expiry/used states disable sending immediately.

## Known Gaps

- Email sending and delivery records are not implemented yet.
- The current speaker-link store retains recoverable raw link tokens for organizer copy/open recovery. A future Supabase migration should move to hash-only storage and a controlled reissue path before high-volume delivery is enabled.
- Resend free-tier limits must be monitored before adding bulk reminders or campaign-style mail.

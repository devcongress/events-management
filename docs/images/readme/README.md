# README screenshots

These images show the built Vue application using synthetic demonstration data. They are not production records, a redesign, or an access-control test of the live service.

## Included views

| Image | Role | Workflow |
|---|---|---|
| `organizer-events.png` | Organizer | Event lifecycle and event list |
| `organizer-guests.png` | Organizer | Registration guest list |
| `organizer-feedback.png` | Organizer | Closed form and response aggregates |
| `organizer-work-plan.png` | Organizer | Standard organizer conference board |
| `volunteer-my-tasks.png` | Volunteer | Assigned tasks only |
| `volunteer-mobile.png` | Volunteer | Phone task list |

## Refresh

From the repository root, after installing dependencies and Playwright Chromium:

```bash
pnpm build
node --import tsx scripts/readme-screenshots.mjs
```

The capture script starts a static Vite preview on `127.0.0.1:4195`, supplies local API fixtures, blocks external browser requests, and rejects unexpected API mutations. Its simulated short-link response creates no real link. No application server or database connection is used. Organizer/volunteer permissions and task filtering come from the app’s shared access helpers; neither role receives extra grants. All email addresses use `example.com`.

The sample date is fixed to 1 November 2026. The guest-list example therefore shows disabled check-in controls for an upcoming event. Local bundled fonts load normally. Captures include actual role-specific navigation and controls; the script does not hide or restyle them.

Inspect every image after refreshing. Check for clipped content, loading states, errors, private records, and unintended role access. Update the root README captions when the UI or fixture changes. `manifest.json` records the route, role, and viewport for each image.

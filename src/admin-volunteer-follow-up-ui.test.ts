import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  new URL("./components/VolunteerFollowUpPanel.vue", import.meta.url),
  "utf8",
);
const datePickerSource = readFileSync(
  new URL("./components/ui/AppDatePicker.vue", import.meta.url),
  "utf8",
);
const desktopSource = readFileSync(
  new URL("./views/admin/AdminVolunteerView.vue", import.meta.url),
  "utf8",
);
const mobileSource = readFileSync(
  new URL("./views/admin/AdminMobileAnnualConferenceView.vue", import.meta.url),
  "utf8",
);
const tabsSource = readFileSync(
  new URL("./components/VolunteerWorkspaceTabs.vue", import.meta.url),
  "utf8",
);
const followUpPanelSource = readFileSync(
  new URL("./components/VolunteerFollowUpPanel.vue", import.meta.url),
  "utf8",
);
const reviewsPanelSource = readFileSync(
  new URL("./components/VolunteerReviewsPanel.vue", import.meta.url),
  "utf8",
);
const outcomePanelSource = readFileSync(
  new URL("./components/VolunteerOutcomeCampaignPanel.vue", import.meta.url),
  "utf8",
);
const followUpViewSource = readFileSync(
  new URL("./views/VolunteerFollowUpView.vue", import.meta.url),
  "utf8",
);
const followUpRouterSource = readFileSync(
  new URL("./router.ts", import.meta.url),
  "utf8",
);
const followUpServerSource = readFileSync(
  new URL("../server/routes/volunteer-follow-up.ts", import.meta.url),
  "utf8",
);

describe("Volunteer follow-up workspace UI", () => {
  it("preserves the travel-support context of the Accra availability answer", () => {
    expect(reviewsPanelSource).toMatch(
      /Can you come to Accra and volunteer on 19 December without\s+travel support\?/u,
    );
  });

  it("uses shared floating controls and disables the deadline picker outside a draft campaign", () => {
    expect(panelSource).toContain("<AppDropdown");
    expect(panelSource).toContain("<AppDatePicker");
    expect(panelSource).toContain(':teleport="true"');
    expect(panelSource).toContain(
      ":disabled=\"busy || campaign.status !== 'draft'\"",
    );
    expect(panelSource).not.toContain("<select");
    expect(panelSource).not.toContain('type="date"');
    expect(datePickerSource).toContain(':disabled="disabled"');
    expect(datePickerSource).toContain("if (props.disabled) return;");
  });

  it("places Reviews beside the directory and reserves Campaign for owners", () => {
    for (const source of [desktopSource, mobileSource]) {
      expect(source).toContain("<VolunteerWorkspaceTabs");
      expect(source).toContain("<VolunteerFollowUpPanel");
      expect(source).toContain("<VolunteerReviewsPanel");
      expect(source).toContain(":is-owner-session=");
      expect(source).toContain(
        "sessionQuery.data.value?.user?.role === 'owner'",
      );
      expect(source).toContain('id="');
      expect(source).toContain('role="tabpanel"');
    }

    expect(desktopSource).toContain(':reviews-visible="canViewReviews"');
    expect(mobileSource).toContain(
      ':reviews-visible="canViewVolunteerReviews"',
    );
    expect(desktopSource).toContain("canViewCampaign = computed(");
    expect(mobileSource).toContain("canViewVolunteerCampaign = computed(");
    expect(tabsSource).toContain('role="tablist"');
    expect(tabsSource).toMatch(/event\.key\s*===\s*['"]ArrowRight['"]/u);
    expect(tabsSource).toMatch(/event\.key\s*===\s*['"]Home['"]/u);
    expect(tabsSource).toMatch(/event\.key\s*===\s*['"]End['"]/u);
    expect(tabsSource).toContain("prefers-reduced-motion: reduce");
    expect(tabsSource).toContain(
      ".volunteer-workspace-tabs--mobile {\n  margin-bottom: -1rem;",
    );
    expect(tabsSource).toContain(
      ".volunteer-workspace-tabs--mobile {\n  margin-bottom: -1rem;\n}\n\n.volunteer-workspace-tabs button",
    );
    expect(desktopSource).toContain(
      "'volunteer-view-workspace--tabbed': canViewReviews || canViewCampaign",
    );
    expect(desktopSource).toContain(
      ".volunteer-view-workspace--tabbed {\n  display: grid;\n  gap: 0;",
    );
    expect(desktopSource).toMatch(
      /'volunteer-directory-panel--tabbed':\s*canViewReviews \|\| canViewCampaign/u,
    );
    expect(mobileSource).toContain(
      "canViewVolunteerReviews || canViewVolunteerCampaign",
    );
    expect(mobileSource).toContain(
      ".volunteer-directory-panel--untabbed {\n  display: contents;",
    );
  });

  it("keeps the directory controls compact, connected, and consistent across screen sizes", () => {
    expect(desktopSource).not.toContain(
      '<p class="editorial-eyebrow">Volunteers</p>',
    );
    expect(desktopSource).toContain(
      'class="volunteer-directory-controls border-b',
    );
    expect(desktopSource).toContain('class="volunteer-lifecycle-filter"');
    expect(desktopSource).toMatch(
      /All\s*<strong>\{\{ volunteerRows\.length \}\}<\/strong>/u,
    );
    expect(desktopSource).toMatch(
      /volunteerStatusFilter === 'active'\s*\?\s*'all'\s*:\s*'active'/u,
    );
    expect(desktopSource).toMatch(
      /volunteerStatusFilter === 'applicant'\s*\?\s*'all'\s*:\s*'applicant'/u,
    );
    expect(desktopSource).toContain(
      "@media (min-width: 768px) and (max-width: 1023px)",
    );
    expect(desktopSource).toContain(
      "@media (hover: hover) and (pointer: fine)",
    );
    expect(desktopSource).toContain(
      "Your directory is ready for its first volunteers",
    );
    expect(desktopSource).toMatch(
      /Volunteer records will appear here as the directory is\s+populated\./u,
    );
    expect(desktopSource).toContain(':name="volunteerViewTransitionName"');
    expect(mobileSource).toContain(':name="mobileVolunteerViewTransitionName"');
    for (const source of [desktopSource, mobileSource]) {
      expect(source).toContain('mode="out-in"');
      expect(source).toContain("volunteer-panel-forward-enter-active");
      expect(source).toContain("volunteer-panel-backward-enter-from");
      expect(source).toContain("prefers-reduced-motion: reduce");
    }
    expect(mobileSource).toContain("volunteer-directory-tools--embedded");
    expect(mobileSource).toMatch(
      /mobileVolunteerStatusFilter === 'active'\s*\?\s*'all'\s*:\s*'active'/u,
    );
    expect(mobileSource).toMatch(
      /mobileVolunteerStatusFilter === 'applicant'\s*\?\s*'all'\s*:\s*'applicant'/u,
    );
    expect(mobileSource).toContain(
      "Active team members and applicants in one directory.",
    );
  });

  it("keeps campaign controls owner-only and previews the production email without sending", () => {
    const previewRouteStart = followUpServerSource.indexOf(
      '"/api/annual-conference/2026/volunteer-follow-up/preview"',
    );
    const previewRouteEnd = followUpServerSource.indexOf(
      'app.get("/api/annual-conference/2026/volunteer-follow-up"',
      previewRouteStart,
    );
    const previewRoute = followUpServerSource.slice(
      previewRouteStart,
      previewRouteEnd,
    );

    expect(previewRoute).toContain('requireAdmin(c, ["owner"])');
    expect(previewRoute).toContain("html: preview.html");
    expect(previewRoute).toContain("text: preview.text");
    expect(followUpPanelSource).toContain('role="dialog"');
    expect(followUpPanelSource).toContain('sandbox="allow-same-origin"');
    expect(followUpPanelSource).not.toContain('sandbox="allow-scripts');
    expect(followUpPanelSource).toContain('@load="handlePreviewFrameLoad"');
    expect(followUpPanelSource).toContain(
      'frameDocument.addEventListener("keydown", handlePreviewFrameKeydown, true)',
    );
    expect(followUpPanelSource).toContain(
      "attachedPreviewFrameDocument?.removeEventListener(",
    );
    expect(followUpPanelSource).toContain(
      'if (!previewOpen.value || event.key !== "Escape") return;',
    );
    expect(followUpPanelSource).toContain('tabindex="-1"');
    expect(followUpPanelSource).toContain(
      "function releasePreviewDrawer(): void",
    );
    expect(followUpPanelSource).toContain(
      "function abortPreviewRequest(): void",
    );
    expect(followUpPanelSource).toContain("previewDrawerLocked = true");
    expect(followUpPanelSource).toContain("previewDrawerLocked = false");
    expect(followUpPanelSource).toContain("controller.signal.aborted");
    expect(followUpPanelSource).toContain(
      'input:not([type="hidden"]):not(:disabled)',
    );
    expect(followUpPanelSource).toContain("activeIndex === -1");
    expect(followUpPanelSource).toContain("}, 15_000);");
    expect(followUpPanelSource).toContain("drawerPanel?.isConnected");
    expect(followUpPanelSource).toContain("app.contains(drawerPanel)");
    const previewLifecycleStart = followUpPanelSource.indexOf(
      "watch(previewOpen, async",
    );
    const selectedCleanupStart = followUpPanelSource.indexOf(
      "function unlockSelectedDialog",
      previewLifecycleStart,
    );
    const previewLifecycle = followUpPanelSource.slice(
      previewLifecycleStart,
      selectedCleanupStart,
    );

    expect(previewLifecycle).not.toContain('setAttribute("inert"');
    expect(previewLifecycle).not.toContain('removeAttribute("inert"');
    expect(previewLifecycle).toContain(
      "document.body.style.overflow = previousBodyOverflow",
    );
    expect(previewLifecycle).toContain(
      "document.documentElement.style.overflow = previousDocumentOverflow",
    );
    expect(followUpPanelSource).not.toContain("handlePreviewWindowBlur");
    expect(followUpPanelSource).not.toContain("handlePreviewFocusIn");
    expect(followUpPanelSource).toContain('aria-disabled="true"');
    expect(followUpPanelSource).toContain("href\\s*=");
    expect(followUpPanelSource).toContain("form-action 'none'");
    expect(followUpPanelSource).not.toContain("Back to invitation");
    expect(followUpPanelSource).not.toContain("previewBackButton");
    expect(followUpPanelSource).not.toContain(
      'querySelector<HTMLElement>("h1[tabindex=',
    );
    expect(followUpPanelSource).toContain(
      ':to="{ name: \'admin-volunteer-follow-up-form-preview\' }"',
    );
    expect(followUpRouterSource).toContain(
      "name: VOLUNTEER_FOLLOW_UP_FORM_PREVIEW_ROUTE",
    );
    expect(followUpRouterSource).toContain(
      "VOLUNTEER_FOLLOW_UP_FORM_PREVIEW_PATH,",
    );
  });

  it("shows the frozen recipient cohort and every delivery diagnostic", () => {
    expect(followUpServerSource).toContain("recipients: snapshot.recipients");
    expect(outcomePanelSource).toContain("Frozen recipients ({{ preview.recipients.length }})");
    expect(outcomePanelSource).toContain("{{ recipient.email }}");
    expect(outcomePanelSource).toContain("Decision version {{ recipient.decision_version }}");
    expect(outcomePanelSource).toContain("Sample template preview");
    expect(outcomePanelSource).not.toMatch(/\.slice\(0,\s*12\)/u);
    expect(outcomePanelSource).toContain(".outcome-diagnostics-scroll {");
  });

  it("loads the read-only form preview through owner authorization and cannot send to the public endpoint", () => {
    const previewBranch = followUpViewSource.indexOf("if (props.previewMode)");
    const publicRead = followUpViewSource.indexOf(
      "`/api/volunteer-follow-up/${encodeURIComponent(recipientId.value)}`",
    );
    const submitMethod = followUpViewSource.indexOf("async function submit()");
    const previewSubmitGuard = followUpViewSource.indexOf(
      "if (props.previewMode) return;",
      submitMethod,
    );
    const publicWrite = followUpViewSource.indexOf(
      'method: "POST"',
      submitMethod,
    );

    expect(previewBranch).toBeGreaterThan(-1);
    expect(previewBranch).toBeLessThan(publicRead);
    expect(followUpViewSource).toContain('credentials: "include"');
    expect(followUpViewSource).toContain(':disabled="previewMode"');
    expect(followUpViewSource).toContain(
      ':disabled="previewMode || !canSubmit"',
    );
    expect(previewSubmitGuard).toBeGreaterThan(submitMethod);
    expect(previewSubmitGuard).toBeLessThan(publicWrite);
    expect(followUpViewSource).toContain(
      "Turnstile appears here on the live form.",
    );
  });

  it("keeps campaign setup before delivery records and maintains a responsive owner drawer", () => {
    expect(
      followUpPanelSource.indexOf('class="follow-up-owner-setup"'),
    ).toBeLessThan(followUpPanelSource.indexOf('class="follow-up-layout"'));
    expect(followUpPanelSource).toContain("follow-up-layout--selected");
    expect(followUpPanelSource).toContain(
      'Teleport to="body" :disabled="!selectedMobileDialog"',
    );
    expect(followUpPanelSource).toContain("handleSelectedKeydown");
    expect(followUpPanelSource).toContain(
      "selectedMediaQuery.addEventListener",
    );
    expect(followUpPanelSource).toContain("closeSelectionOnBreakpointChange");
    expect(followUpPanelSource).not.toContain("filter = 'to_review'");
    expect(followUpPanelSource).toContain(
      "paginateVolunteerFollowUpRecipients",
    );
    expect(followUpPanelSource).toMatch(
      /watch\(\s*\(\) => campaign\.value\?\.application_deadline_at/u,
    );
  });

  it("aligns the campaign setup groups and distinguishes saved dates from drafts", () => {
    expect(followUpPanelSource).toContain(
      '<span class="editorial-label">Preview</span>',
    );
    expect(followUpPanelSource).toContain(
      '<span class="editorial-label">Campaign controls</span>',
    );
    expect(followUpPanelSource).toContain(
      'class="follow-up-button follow-up-button--secondary follow-up-save-deadline"',
    );
    expect(followUpPanelSource).toContain("min-height: 2.75rem;");
    expect(followUpPanelSource).toContain("min-height: 3.125rem;");
    expect(followUpPanelSource).toContain("justify-content: flex-start;");
    expect(followUpPanelSource).toContain("Saved application deadline");
    expect(followUpPanelSource).toContain("Draft date selected:");
    expect(followUpPanelSource).toContain(
      "Save the updated date before launch.",
    );
    expect(followUpPanelSource).toContain(
      "The saved date is ready for launch.",
    );
    expect(followUpPanelSource).toContain(
      ".follow-up-deadline-control :deep(.editorial-label) {\n  margin-bottom: 0;",
    );
    expect(followUpPanelSource).toContain(
      ".follow-up-preview-links {\n  display: flex;\n  flex-wrap: wrap;",
    );
    expect(followUpPanelSource).toMatch(
      /\.follow-up-campaign-controls\s*> :is\(\.follow-up-button, \.follow-up-text-button\):first-of-type\s*\{\s*margin-top: 0\.375rem;/u,
    );
    expect(followUpPanelSource).toContain(
      ".follow-up-owner-setup-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(followUpPanelSource).toContain(
      ".follow-up-skeleton-setup-cell--controls {\n    grid-column: 1 / -1;",
    );
  });

  it("groups the recipient filter beside search without a duplicate people count", () => {
    const toolbarStart = followUpPanelSource.indexOf(
      'class="follow-up-inbox-toolbar"',
    );
    const listStart = followUpPanelSource.indexOf(
      'class="follow-up-recipient-list"',
      toolbarStart,
    );
    const toolbar = followUpPanelSource.slice(toolbarStart, listStart);

    expect(toolbar).toContain(
      '<h3 class="follow-up-kicker follow-up-inbox-title">',
    );
    expect(toolbar).toContain("Applicant inbox");
    expect(toolbar).not.toContain(
      "People <span>{{ filteredRecipients.length }}</span>",
    );
    expect(toolbar).toContain('class="follow-up-inbox-controls"');
    expect(toolbar).toContain('aria-label="Filter follow-up recipients"');
    expect(toolbar).toContain('class="follow-up-search"');
    expect(toolbar).toContain('class="follow-up-range"');
    expect(followUpPanelSource).toContain(
      'class="follow-up-skeleton-inbox-toolbar"',
    );
    expect(followUpPanelSource).toContain("@container (max-width: 43rem)");
    expect(followUpPanelSource).toContain("@container (max-width: 27rem)");
  });

  it("keeps both protected previews beside each other in campaign setup", () => {
    const previewStart = followUpPanelSource.indexOf(
      'class="follow-up-preview-links"',
    );
    const controlsStart = followUpPanelSource.indexOf(
      'class="follow-up-campaign-controls"',
      previewStart,
    );
    const previewActions = followUpPanelSource.slice(
      previewStart,
      controlsStart,
    );

    expect(previewActions).toContain('class="follow-up-preview-link"');
    expect(previewActions).toContain(
      'Preview <span aria-hidden="true">↗</span>',
    );
    expect(previewActions).toContain('@click="openPreview"');
    expect(previewActions).toContain("Preview volunteer form");
    expect(previewActions).toContain(
      ':to="{ name: \'admin-volunteer-follow-up-form-preview\' }"',
    );
    expect(previewActions.match(/<RouterLink\b/gu)).toHaveLength(1);
    expect(followUpPanelSource).not.toContain("<VolunteerFollowUpView");
    expect(followUpPanelSource).not.toContain("previewDrawerView");
    expect(followUpPanelSource).toContain(
      '<h2 id="follow-up-preview-title">Invitation email</h2>',
    );
    const previewDrawerStart = followUpPanelSource.indexOf(
      '<section\n            ref="previewDrawerPanel"',
    );
    const previewDrawerEnd = followUpPanelSource.indexOf(
      "</section>\n        </div>\n      </Transition>\n    </Teleport>",
      previewDrawerStart,
    );

    expect(previewDrawerStart).toBeGreaterThan(-1);
    expect(previewDrawerEnd).toBeGreaterThan(previewDrawerStart);
    expect(
      followUpPanelSource.slice(previewDrawerStart, previewDrawerEnd),
    ).not.toContain("Preview volunteer form");
    expect(followUpPanelSource).toContain('aria-label="Email preview format"');
    expect(followUpPanelSource).toContain("Plain text");
    const emailFrameStylesStart = followUpPanelSource.indexOf(
      ".follow-up-email-panel iframe {",
    );
    const emailFrameStylesEnd = followUpPanelSource.indexOf(
      "}",
      emailFrameStylesStart,
    );

    expect(
      followUpPanelSource.slice(emailFrameStylesStart, emailFrameStylesEnd),
    ).not.toContain("pointer-events: none");
    expect(followUpViewSource).toContain("previewSeed?: string | null");
    expect(followUpViewSource).toContain("if (props.previewSeed)");
    expect(followUpViewSource).toContain(
      "state.value = createPreviewFormState(props.previewSeed)",
    );
    expect(followUpViewSource).toContain("embeddedPreview?: boolean");
    expect(followUpViewSource).toContain(
      "Preview only</strong> · Example answers · Submission is",
    );
    expect(followUpViewSource).toContain(
      ':disabled="previewMode || !canSubmit"',
    );
  });

  it("uses a content-shaped accessible first-load skeleton and retains cached data after refresh failures", () => {
    expect(followUpPanelSource).toContain(':aria-busy="query.isPending.value"');
    expect(followUpPanelSource).toContain(
      'class="follow-up-skeleton-progress"',
    );
    expect(followUpPanelSource).toContain(
      'class="follow-up-skeleton-timeline"',
    );
    expect(followUpPanelSource).toContain('class="follow-up-skeleton-setup"');
    expect(followUpPanelSource).toContain('class="follow-up-skeleton-inbox"');
    expect(followUpPanelSource).toContain(
      'role="status">Loading follow-up campaign…',
    );
    expect(followUpPanelSource).toContain(
      'class="follow-up-skeleton-content" aria-hidden="true"',
    );
    expect(followUpPanelSource).toContain(
      "query.isError.value && !query.data.value",
    );
    expect(followUpPanelSource).toContain("query.isRefetchError.value");
    expect(followUpPanelSource).toContain(
      "Showing the last loaded campaign data.",
    );
    expect(followUpPanelSource).toContain("@media (max-width: 900px)");
    expect(followUpPanelSource).toContain("@media (max-width: 600px)");
    expect(followUpPanelSource).not.toContain("animation:");
  });

  it("keeps the normal read free of reconciliation and enrolls during schedule recovery", () => {
    const readStart = followUpServerSource.indexOf(
      'app.get("/api/annual-conference/2026/volunteer-follow-up"',
    );
    const readEnd = followUpServerSource.indexOf(
      'app.patch(\n    "/api/annual-conference/2026/volunteer-follow-up/settings"',
      readStart,
    );
    const readRoute = followUpServerSource.slice(readStart, readEnd);
    const schedulerStart = followUpServerSource.indexOf(
      "async function sendDueVolunteerFollowUps",
    );
    const schedulerEnd = followUpServerSource.indexOf(
      "export function registerVolunteerFollowUpRoutes",
      schedulerStart,
    );
    const scheduler = followUpServerSource.slice(schedulerStart, schedulerEnd);

    expect(readRoute).not.toContain("reconcileVolunteerFollowUpApplicants");
    expect(readRoute).toContain("Promise.all([");
    expect(readRoute).toContain("reviewerRecipient(recipient, outcomeSentIds.has(recipient.id))");
    expect(scheduler).toContain('campaign.status !== "closed"');
    expect(scheduler).toContain(
      "await reconcileVolunteerFollowUpApplicants(campaign, c)",
    );
  });
});
